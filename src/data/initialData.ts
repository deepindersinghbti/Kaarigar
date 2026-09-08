import { WorkerProfile, JobItem, KamaiEntry } from '../types';
import { daysAgoIso } from '../utils/date';

export const RAMESH_ELECTRICIAN_PASSPORT_SKILLS = [
  'Earthing Check',
  'Ceiling Fan Installation',
  'Fan Repair',
  'Fault Diagnosis',
  'Geyser Point',
  'House Wiring Point',
  'Inverter Installation',
  'Light Fitting',
  'MCB Replacement',
  'Switchboard Installation',
];

/** Add the agreed skill catalogue when opening the seeded Ramesh demo. */
export function addRameshPassportSkills(profile: WorkerProfile): WorkerProfile {
  if (profile.passportHandle !== 'ramesh-kumar-chd') return profile;
  const skills = [...new Set([...profile.skills, ...RAMESH_ELECTRICIAN_PASSPORT_SKILLS])];
  return skills.length === profile.skills.length ? profile : { ...profile, skills };
}

/**
 * Seed dates are relative to today, never literals. Pinned dates made the
 * dashboard show one fixed day's data as "today" forever - which looks correct
 * on stage while being wrong, the worst kind of demo bug.
 */

export const INITIAL_PROFILE: WorkerProfile = {
  id: 'krg-2026-8842',
  userId: 'usr-demo-ramesh',
  passportHandle: 'ramesh-kumar-chd',
  name: 'Ramesh Kumar',
  trade: 'Electrician',
  experienceYears: 18,
  location: 'Sector 35, Chandigarh',
  phone: '+91 98765 43210',
  skills: RAMESH_ELECTRICIAN_PASSPORT_SKILLS,
  certifications: [
    'ITI Electrician National Trade Certificate (NTC)',
    'Pradhan Mantri Kaushal Vikas Yojana (PMKVY) Level 4',
  ],
  rating: 4.9,
  totalJobsCount: 248,
  totalEarnings: 384500,
  verifiedStatus: 'unverified',
  joinedDate: 'March 2024',
  bloodGroup: 'O+',
  dailyRate: 1200,
  bio: '18+ saal ka anubhav ghar aur commercial wiring, switchboard fitting, aur emergency electrical fault repair mein.',
};

export const INITIAL_JOBS: JobItem[] = [
  {
    id: 'job-101',
    kaarigarId: 'krg-2026-8842',
    title: 'Fan Installation & Regulator Replacement',
    customerName: 'Neha Sharma',
    customerPhone: '+91 98123 45678',
    location: 'Sector 35-C, Chandigarh',
    amount: 1100,
    paymentMethod: 'cash',
    status: 'COMPLETED',
    date: daysAgoIso(0),
    time: '11:30 AM',
    notes: 'Ceiling fan mounted and speed regulator tested successfully.',
    skillsTagged: ['Fan Installation', 'Switchboard Installation'],
    stateHistory: [],
    syncState: 'synced',
  },
  {
    id: 'job-102',
    kaarigarId: 'krg-2026-8842',
    title: 'Main MCB Box Sparking & Repair',
    customerName: 'Rajesh Gupta',
    customerPhone: '+91 94170 11223',
    location: 'Sector 22, Chandigarh',
    amount: 1500,
    paymentMethod: 'upi',
    status: 'COMPLETED',
    date: daysAgoIso(0),
    time: '02:15 PM',
    notes: 'Replaced burnt 32A MCB switch with Schneider dual-pole breaker.',
    skillsTagged: ['MCB & Switchboard Installation', 'House Wiring'],
    stateHistory: [],
    syncState: 'synced',
  },
  {
    id: 'job-103',
    kaarigarId: 'krg-2026-8842',
    title: '3-BHK Modular Switchboard Setup',
    customerName: 'Amit Verma',
    customerPhone: '+91 98722 33445',
    location: 'Sector 44-B, Chandigarh',
    amount: 2800,
    paymentMethod: 'upi',
    status: 'COMPLETED',
    date: daysAgoIso(1),
    time: '04:00 PM',
    notes: 'Completed complete living room modular lighting setup.',
    skillsTagged: ['House Wiring', 'MCB & Switchboard Installation'],
    stateHistory: [],
    syncState: 'synced',
  },
  {
    id: 'job-104',
    kaarigarId: 'krg-2026-8842',
    title: 'Geyser Heavy Load Power Point & Earthing',
    customerName: 'Pooja Mehra',
    customerPhone: '+91 97800 55667',
    location: 'Phase 7, Mohali',
    amount: 1200,
    paymentMethod: 'cash',
    status: 'COMPLETED',
    date: daysAgoIso(2),
    time: '10:00 AM',
    notes: 'Installed 16A anchor socket with high-grade copper earthing wire.',
    skillsTagged: ['Appliance Earthing & Safety', 'House Wiring'],
    stateHistory: [],
    syncState: 'synced',
  },
];

export const INITIAL_KAMAI: KamaiEntry[] = [
  {
    id: 'km-01',
    profileId: 'krg-2026-8842',
    direction: 'in',
    syncState: 'synced',
    date: daysAgoIso(0),
    amount: 1100,
    description: 'Fan Installation (Customer: Neha Sharma)',
    customerName: 'Neha Sharma',
    paymentType: 'cash',
    jobId: 'job-101',
  },
  {
    id: 'km-02',
    profileId: 'krg-2026-8842',
    direction: 'in',
    syncState: 'synced',
    date: daysAgoIso(0),
    amount: 1500,
    description: 'Main MCB Box Repair (Customer: Rajesh Gupta)',
    customerName: 'Rajesh Gupta',
    paymentType: 'upi',
    jobId: 'job-102',
  },
  {
    id: 'km-03',
    profileId: 'krg-2026-8842',
    direction: 'in',
    syncState: 'synced',
    date: daysAgoIso(1),
    amount: 2800,
    description: '3-BHK Modular Switchboard Setup',
    customerName: 'Amit Verma',
    paymentType: 'upi',
    jobId: 'job-103',
  },
  {
    id: 'km-04',
    profileId: 'krg-2026-8842',
    direction: 'in',
    syncState: 'synced',
    date: daysAgoIso(2),
    amount: 1200,
    description: 'Geyser Power Point & Earthing',
    customerName: 'Pooja Mehra',
    paymentType: 'cash',
    jobId: 'job-104',
  },
  {
    id: 'km-05',
    profileId: 'krg-2026-8842',
    direction: 'in',
    syncState: 'synced',
    date: daysAgoIso(3),
    amount: 1800,
    description: 'Inverter Wiring & Battery Checkup',
    customerName: 'Suresh Rana',
    paymentType: 'cash',
  },
];
