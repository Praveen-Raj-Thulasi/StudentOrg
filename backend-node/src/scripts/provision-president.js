import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../config/db.js';
import { RoleAssignmentService } from '../services/roleAssignment.service.js';

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      args[key] = value || true;
    }
  }
  return args;
}

export async function runPresidentProvisioning() {
  const args = parseArgs();
  const email = args.email || process.env.PRESIDENT_EMAIL || 'president@skyline.edu';
  const password = args.password || process.env.PRESIDENT_PASSWORD || 'President123!';
  const name = args.name || process.env.PRESIDENT_NAME || 'Association President';
  const transfer = Boolean(args.transfer);

  console.log('----------------------------------------------------');
  console.log('Skyline Student Association Hub: President Provisioning');
  console.log('----------------------------------------------------');
  console.log(`Target Email: ${email}`);
  console.log(`Target Name:  ${name}`);
  if (transfer) console.log(`Mode:         Administrative Role Transfer (--transfer)`);

  await connectDB();

  try {
    const result = await RoleAssignmentService.provisionPresident({
      email,
      password,
      name,
      transfer,
    });

    if (result.alreadyProvisioned) {
      console.log(`[INFO] President account already provisioned and active:`);
      console.log(`       User ID:       ${result.user.id}`);
      console.log(`       Member Number: ${result.user.memberNumber}`);
      console.log(`       Email:         ${result.user.email}`);
      console.log(`       Roles:         ${result.user.roles.join(', ')}`);
    } else {
      console.log(`[SUCCESS] Initial President provisioned successfully!`);
      console.log(`          User ID:       ${result.user.id}`);
      console.log(`          Member Number: ${result.user.memberNumber}`);
      console.log(`          Email:         ${result.user.email}`);
      console.log(`          Roles:         ${result.user.roles.join(', ')}`);
    }

    return result;
  } catch (err) {
    console.error(`[ERROR] Failed to provision President: ${err.message}`);
    throw err;
  } finally {
    if (mongoose.connection.readyState !== 0 && process.env.NODE_ENV !== 'test') {
      await disconnectDB();
    }
  }
}

// Execute directly if run via CLI
if (process.argv[1]?.endsWith('provision-president.js')) {
  runPresidentProvisioning()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export default runPresidentProvisioning;
