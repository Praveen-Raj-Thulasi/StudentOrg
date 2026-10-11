# CollegeEvents — Post-Migration Data Reconciliation Report

> **Generated:** 2026-10-10T21:48:12.522Z  
> **Duration:** 0.29s  
> **Overall Status:** ✅ ALL CHECKS PASSED (RECONCILED)  
> **Summary:** Passed: 22 | Warnings: 0 | Failures: 0

---

## 1. Record Count Equality
| Metric / Table | Status | Details |
| :--- | :--- | :--- |
| Users Count Equality | ✅ PASS | MySQL: 10 | MongoDB: 10 |
| Organizers Count Equality | ✅ PASS | MySQL: 5 | MongoDB: 5 |
| Events Count Equality | ✅ PASS | MySQL: 5 | MongoDB: 5 |
| Bookings Count Equality | ✅ PASS | MySQL: 6 | MongoDB: 6 |
| Payments Count Equality | ✅ PASS | MySQL: 5 | MongoDB: 5 |
| Refunds Count Equality | ✅ PASS | MySQL: 0 | MongoDB: 0 |
| Certificates Count Equality | ✅ PASS | MySQL: 0 | MongoDB: 0 |
| Attendance Count Equality | ✅ PASS | MySQL: 0 | MongoDB: 0 |
| Ratings Count Equality | ✅ PASS | MySQL: 0 | MongoDB: 0 |
| Connections Count Equality | ✅ PASS | MySQL: 4 | MongoDB: 4 |
| Direct Messages Count Equality | ✅ PASS | MySQL: 6 | MongoDB: 6 |
| Organizer Scores Count Equality | ✅ PASS | MySQL: 5 | MongoDB: 5 |
| User Interests Count Equality | ✅ PASS | MySQL: 5 | MongoDB: 5 |

---

## 2. Referential Integrity & Relationships
| Relationship | Status | Details |
| :--- | :--- | :--- |
| Event -> Organizer Reference | ✅ PASS | 100% of Events link to valid Organizers. |
| Booking -> User & Event References | ✅ PASS | 100% of Bookings resolve to valid Users and Events. |
| Payment -> Booking References | ✅ PASS | 100% of Payments resolve to valid Bookings. |

---

## 3. Financial & Revenue Reconciliation
| Financial Metric | Status | Details |
| :--- | :--- | :--- |
| Booking Revenue & Ticket Quantity Reconciliation | ✅ PASS | Revenue: ₹2992 (exact match) | Tickets: 8 |
| Successful Payment Volume Reconciliation | ✅ PASS | Successful Payments Total: ₹2493 (exact match) |

---

## 4. External Identifiers Preservation
| Identifier Type | Status | Details |
| :--- | :--- | :--- |
| Ticket ID Preservation | ✅ PASS | All 6 ticket codes (e.g. TKT-ANJALI-001) preserved 1:1. |
| Payment Transaction ID Preservation | ✅ PASS | All 5 transaction references (e.g. TXN-001-ARUN) preserved 1:1. |

---

## 5. Security & Credential Format
| Security Check | Status | Details |
| :--- | :--- | :--- |
| User Password Hashes Format | ✅ PASS | All 10 user password hashes verified as valid BCrypt format ($2a$/$2b$). |
| Organizer Password Hashes Format | ✅ PASS | All 5 organizer password hashes verified as valid BCrypt format ($2a$/$2b$). |

---

## Human Sign-Off Gate
- [ ] Source MySQL database write-freeze confirmed.
- [ ] Financial totals verified and audited.
- [ ] Spot-check user login using migrated bcrypt credentials confirmed.
- [ ] Cutover approved by Lead Architect / System Administrator: _____________________ Date: __________
