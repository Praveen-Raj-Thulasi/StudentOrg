import { Reimbursement, Expense } from '../models/index.js';

/**
 * Receipt Validation & OCR Adapter
 * Performs automated receipt analysis when parseable text or structured receipt metadata is available,
 * and handles raw attachments with deterministic mismatch and duplicate receipt checking.
 *
 * CRITICAL RULE: Never report successful OCR when it was not performed.
 */
export async function validateReceipt({
  claimedAmount,
  receiptUrl = null,
  receiptText = null,
  claimId = null,
  academicTerm = null,
}) {
  const warnings = [];
  let ocrPerformed = false;
  let extractedTotal = null;
  let extractedVendor = null;
  let extractedDate = null;
  let confidence = 0;
  let duplicateRisk = false;
  const duplicateReferences = [];

  const claimed = Number(claimedAmount || 0);

  // 1. Duplicate receipt detection across Reimbursements & Expenses
  if (receiptUrl && receiptUrl.trim()) {
    const cleanUrl = receiptUrl.trim();

    // Check existing reimbursements
    const duplicateReimbursements = await Reimbursement.find({
      receiptUrl: cleanUrl,
      ...(claimId ? { id: { $ne: Number(claimId) } } : {}),
    })
      .select('id claimNumber amount status claimantId')
      .lean();

    for (const dup of duplicateReimbursements) {
      duplicateRisk = true;
      duplicateReferences.push(`Claim #${dup.claimNumber} (₹${dup.amount})`);
    }

    // Check existing expenses
    const duplicateExpenses = await Expense.find({
      receiptUrl: cleanUrl,
    })
      .select('id reference amount payee')
      .lean();

    for (const dup of duplicateExpenses) {
      duplicateRisk = true;
      duplicateReferences.push(`Expense #${dup.reference} (₹${dup.amount})`);
    }

    if (duplicateRisk) {
      warnings.push(
        `Potential duplicate receipt: Identical receipt URL found in ${duplicateReferences.join(', ')}`
      );
    }
  }

  // 2. OCR text extraction & parsing
  // Check if parseable text exists in receiptText or embedded metadata
  if (receiptText && typeof receiptText === 'string' && receiptText.trim().length > 0) {
    ocrPerformed = true;
    const text = receiptText.trim();

    // Vendor matching
    const vendorMatch = text.match(/(?:vendor|merchant|store|payee|billed\s*by|from)\s*[:=]\s*([^\n\r,]+)/i);
    if (vendorMatch) {
      extractedVendor = vendorMatch[1].trim();
    }

    // Date matching (YYYY-MM-DD or DD/MM/YYYY)
    const dateMatch = text.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/);
    if (dateMatch) {
      extractedDate = dateMatch[1];
    }

    // Total amount extraction patterns (e.g. "Total: 450.00", "Grand Total INR 1200", "Amount: ₹500")
    const totalPatterns = [
      /(?:grand\s*total|net\s*total|total\s*amount|final\s*total|bill\s*amount|amount\s*paid|total)\s*[:=₹RsINR\s]*([0-9]+(?:[.,][0-9]{2})?)/i,
      /(?:₹|Rs\.?|INR)\s*([0-9]+(?:[.,][0-9]{2})?)/i,
    ];

    for (const pattern of totalPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const parsed = parseFloat(match[1].replace(',', ''));
        if (!isNaN(parsed) && parsed > 0) {
          extractedTotal = parsed;
          confidence = pattern === totalPatterns[0] ? 0.95 : 0.75;
          break;
        }
      }
    }

    if (extractedTotal === null) {
      // Numbers found but no explicit total keyword
      const anyNum = text.match(/([0-9]+(?:[.,][0-9]{2})?)/);
      if (anyNum) {
        extractedTotal = parseFloat(anyNum[1].replace(',', ''));
        confidence = 0.4;
        warnings.push('Uncertain extraction: Total derived without explicit "Total" label. Manual review required.');
      } else {
        confidence = 0.1;
        warnings.push('Receipt text present but no valid numerical total could be extracted.');
      }
    }
  } else {
    // No parseable text supplied or raw binary image without OCR engine
    ocrPerformed = false;
    confidence = 0;
    warnings.push('Automated OCR engine unavailable for binary image; manual receipt verification required.');
  }

  // 3. Amount Comparison
  let amountMismatch = false;
  let mismatchDifference = 0;

  if (ocrPerformed && extractedTotal !== null) {
    mismatchDifference = Number((Math.abs(claimed - extractedTotal)).toFixed(2));
    if (mismatchDifference > 0.01) {
      amountMismatch = true;
      warnings.push(
        `Amount mismatch: Claimed ₹${claimed.toFixed(2)} does not match extracted receipt total ₹${extractedTotal.toFixed(2)} (variance: ₹${mismatchDifference.toFixed(2)})`
      );
    }
  }

  return {
    ocrPerformed,
    status: ocrPerformed
      ? amountMismatch
        ? 'MISMATCH_DETECTED'
        : duplicateRisk
        ? 'FLAGGED_DUPLICATE'
        : 'VERIFIED'
      : 'MANUAL_REVIEW_REQUIRED',
    extractedTotal,
    extractedVendor,
    extractedDate,
    confidence,
    amountMismatch,
    mismatchDifference,
    duplicateRisk,
    duplicateReferences,
    warnings,
    needsManualReview: !ocrPerformed || amountMismatch || duplicateRisk || confidence < 0.8,
  };
}

export default validateReceipt;
