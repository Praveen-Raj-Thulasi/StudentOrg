import mongoose from 'mongoose';
import { User, Organizer } from '../src/models/index.js';

async function main() {
  await mongoose.connect('mongodb://localhost:27017/event_booking_db');
  const pres = await User.findOne({ roles: 'PRESIDENT' });
  const treas = await User.findOne({ roles: 'TREASURER' });
  const vol = await User.findOne({ roles: 'VOLUNTEER' });
  const student = await User.findOne({ roles: 'STUDENT', email: { $ne: pres?.email } });
  const org = await Organizer.findOne({});
  console.log('PRESIDENT:', pres?.email, pres?.name);
  console.log('TREASURER:', treas?.email, treas?.name);
  console.log('VOLUNTEER:', vol?.email, vol?.name);
  console.log('STUDENT:', student?.email, student?.name);
  console.log('ORGANIZER:', org?.email, org?.organizerName);
  await mongoose.disconnect();
}
main().catch(console.error);
