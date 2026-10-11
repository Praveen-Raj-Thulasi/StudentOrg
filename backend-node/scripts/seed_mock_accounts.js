import mongoose from 'mongoose';
import { User, Organizer } from '../src/models/index.js';
import { hashPassword } from '../src/utils/password.js';

async function seedMockAccounts() {
  await mongoose.connect('mongodb://localhost:27017/event_booking_db');
  console.log('Connected to DB');

  const defaultPassword = 'Password123!';

  // 1. President: president@skyline.edu
  let pres = await User.findOne({ email: 'president@skyline.edu' });
  const presPass = await hashPassword('President123!');
  if (!pres) {
    pres = await User.create({
      name: 'Skyline President',
      email: 'president@skyline.edu',
      passwordHash: presPass,
      role: 'ADMIN',
      roles: ['PRESIDENT', 'STUDENT'],
      emailVerified: true,
      memberNumber: 'MEM0001',
    });
    console.log('Created President: president@skyline.edu / President123!');
  } else {
    pres.passwordHash = presPass;
    pres.emailVerified = true;
    pres.roles = ['PRESIDENT', 'STUDENT'];
    pres.role = 'ADMIN';
    await pres.save();
    console.log('Updated President: president@skyline.edu / President123!');
  }

  // 2. Student: student@skyline.edu
  let student = await User.findOne({ email: 'student@skyline.edu' });
  const studentPass = await hashPassword('Student123!');
  if (!student) {
    student = await User.create({
      name: 'Alex Student',
      email: 'student@skyline.edu',
      passwordHash: studentPass,
      role: 'USER',
      roles: ['STUDENT'],
      emailVerified: true,
      memberNumber: 'MEM0002',
    });
    console.log('Created Student: student@skyline.edu / Student123!');
  } else {
    student.passwordHash = studentPass;
    student.emailVerified = true;
    student.roles = ['STUDENT'];
    student.role = 'USER';
    await student.save();
    console.log('Updated Student: student@skyline.edu / Student123!');
  }

  // 3. Organizer: organizer@skyline.edu
  let org = await Organizer.findOne({ email: 'organizer@skyline.edu' });
  const orgPass = await hashPassword('Organizer123!');
  if (!org) {
    org = await Organizer.create({
      organizerName: 'Skyline Activities Council',
      organizationName: 'Skyline Student Association',
      email: 'organizer@skyline.edu',
      passwordHash: orgPass,
      emailVerified: true,
      category: 'Student Affairs',
    });
    console.log('Created Organizer: organizer@skyline.edu / Organizer123!');
  } else {
    org.passwordHash = orgPass;
    org.organizerName = 'Skyline Activities Council';
    org.organizationName = 'Skyline Student Association';
    org.emailVerified = true;
    await org.save();
    console.log('Updated Organizer: organizer@skyline.edu / Organizer123!');
  }

  // 4. Treasurer: treasurer@skyline.edu
  let treas = await User.findOne({ email: 'treasurer@skyline.edu' });
  const treasPass = await hashPassword('Treasurer123!');
  if (!treas) {
    treas = await User.create({
      name: 'Morgan Treasurer',
      email: 'treasurer@skyline.edu',
      passwordHash: treasPass,
      role: 'USER',
      roles: ['STUDENT', 'TREASURER'],
      emailVerified: true,
      memberNumber: 'MEM0003',
    });
    console.log('Created Treasurer: treasurer@skyline.edu / Treasurer123!');
  } else {
    treas.passwordHash = treasPass;
    treas.emailVerified = true;
    treas.roles = ['STUDENT', 'TREASURER'];
    treas.role = 'USER';
    await treas.save();
    console.log('Updated Treasurer: treasurer@skyline.edu / Treasurer123!');
  }

  // 5. Volunteer: volunteer@skyline.edu
  let vol = await User.findOne({ email: 'volunteer@skyline.edu' });
  const volPass = await hashPassword('Volunteer123!');
  if (!vol) {
    vol = await User.create({
      name: 'Sam Volunteer',
      email: 'volunteer@skyline.edu',
      passwordHash: volPass,
      role: 'USER',
      roles: ['STUDENT', 'VOLUNTEER'],
      emailVerified: true,
      memberNumber: 'MEM0004',
    });
    console.log('Created Volunteer: volunteer@skyline.edu / Volunteer123!');
  } else {
    vol.passwordHash = volPass;
    vol.emailVerified = true;
    vol.roles = ['STUDENT', 'VOLUNTEER'];
    vol.role = 'USER';
    await vol.save();
    console.log('Updated Volunteer: volunteer@skyline.edu / Volunteer123!');
  }

  await mongoose.disconnect();
  console.log('Seeding completed successfully!');
}

seedMockAccounts().catch(console.error);
