// ══════════════════════════════════════════════════════════
// Sondhan Health — মেডিকেল টেস্টের মূল্যতালিকা (সরকারি প্রতিষ্ঠান): ডেটা
//
// নিয়ম (এই ফাইলে যা মানা হয়েছে, ভবিষ্যতে এন্ট্রি যোগ করলেও মানতে হবে):
//  • কোনো মূল্য কল্পনা/অনুমান করে লেখা হয়নি — প্রতিটা entry-র একটা
//    সনাক্তযোগ্য সরকারি উৎস (ডকুমেন্ট/সার্কুলার) আছে, sourceUrl-এ লিংক।
//  • আমি (Claude) নিজে কোনো প্রাইস "verify" করিনি (ফোন করে/সরেজমিনে) —
//    তাই status সবসময় 'needs_reverify', কখনো 'verified' না, যতক্ষণ না
//    কোনো মানুষ বাস্তবে নিশ্চিত করে এই ফাইল আপডেট করছেন।
//  • একই টেস্টের একাধিক উৎস/প্রতিষ্ঠানভেদে দাম আলাদা হলে — একটাকে
//    "সাধারণ" ধরে বাকিগুলো বাদ দেওয়া হয়নি; সবগুলো আলাদা prices[] entry
//    হিসেবে রাখা হয়েছে (দেখুন: ডেঙ্গু, যেখানে দুটো ভিন্ন সরকারি উৎস আছে)।
//  • যে ক্যাটাগরিতে কোনো নির্ভরযোগ্য উৎস পাওয়া যায়নি (ECG, বুকের এক্স-রে,
//    আল্ট্রাসনোগ্রাম, ব্লাড গ্রুপিং — উৎস ডকুমেন্টে OCR/স্ক্যান অস্পষ্ট ছিল)
//    সেগুলো এই সংস্করণে যোগ করা হয়নি — ভুল তথ্যের চেয়ে কম তথ্য ভালো।
// ══════════════════════════════════════════════════════════

export const CATEGORIES = [
  { id: 'blood',     label: 'রক্ত পরীক্ষা' },
  { id: 'diabetes',  label: 'ডায়াবেটিস ও রক্তে শর্করা' },
  { id: 'kidney',    label: 'কিডনি পরীক্ষা' },
  { id: 'liver',     label: 'লিভার পরীক্ষা' },
  { id: 'thyroid',   label: 'থাইরয়েড ও হরমোন' },
  { id: 'urine',     label: 'প্রস্রাব ও মল পরীক্ষা' },
  { id: 'infection', label: 'সংক্রমণ ও অন্যান্য পরীক্ষা' },
];

// উৎস — পুনঃব্যবহারের জন্য আলাদা করে রাখা
const SRC_DGHS_DMCH = {
  sourceName: 'স্বাস্থ্য অধিদপ্তর (DGHS) — হাসপাতাল ইউজার ফি সার্কুলার, ক্লিনিক্যাল প্যাথলজি বিভাগ, ঢাকা মেডিকেল কলেজ হাসপাতাল',
  sourceUrl: 'http://hospitaldghs.gov.bd/wp-content/uploads/2019/11/Hospital_User_Fees.pdf',
  facility: 'ঢাকা মেডিকেল কলেজ হাসপাতাল (সরকারি)',
  publishedDate: '2020-03-02',
};
const SRC_DGHS_DENGUE_2025 = {
  sourceName: 'স্বাস্থ্য অধিদপ্তর (DGHS) সার্কুলার — সরকারি হাসপাতালে ডেঙ্গু টেস্টের নির্ধারিত মূল্য (The Daily Star রিপোর্ট)',
  sourceUrl: 'https://www.thedailystar.net/health/disease/news/dengue-testing-fees-remain-tk-50-govt-hospitals-3929391',
  facility: 'সরকারি হাসপাতাল (DGHS সার্কুলার, দেশজুড়ে)',
  publishedDate: '2025-06-30',
  notes: 'সার্কুলার অনুযায়ী এই মূল্য ৩১ ডিসেম্বর ২০২৫ পর্যন্ত কার্যকর ছিল বলে উল্লেখ আছে — তার পরের হালনাগাদ এখনো যাচাই করা হয়নি।',
};

// প্রতিটা টেস্টের pricesটা list — একাধিক উৎস/প্রতিষ্ঠান থাকলে একাধিক entry
const one = (amount, src, extra = {}) => [{ amount, status: 'needs_reverify', ...src, ...extra }];

export const TESTS = [
  { id: 'cbc', en: 'CBC — Complete Blood Count', abbr: 'CBC', bn: 'রক্তের বিভিন্ন উপাদানের পরীক্ষা', category: 'blood',
    explain: 'হিমোগ্লোবিন, শ্বেত রক্তকণিকা ও প্লেটলেটের মতো উপাদানের পরিমাণ সম্পর্কে ধারণা পেতে — সাধারণ স্বাস্থ্য পরীক্ষা থেকে শুরু করে রক্তশূন্যতা বা সংক্রমণ বোঝার জন্য প্রায়ই করা হয়।',
    prices: one(150, SRC_DGHS_DMCH) },

  { id: 'glucose', en: 'Blood Glucose', abbr: 'RBS/FBS', bn: 'রক্তে শর্করা (সুগার)', category: 'diabetes',
    explain: 'রক্তে চিনির পরিমাণ মাপা হয় — ডায়াবেটিস ধরা পড়া বা নিয়ন্ত্রণে আছে কি না বোঝার জন্য।',
    prices: one(60, SRC_DGHS_DMCH, { notes: 'উৎস নথিতে উপবাস (fasting) না খাবার-পরবর্তী (PP) — কোন ধরনের তা আলাদা করে বলা নেই।' }) },

  { id: 'hba1c', en: 'HbA1c', abbr: 'HbA1c', bn: 'তিন মাসের গড় রক্তে শর্করা', category: 'diabetes',
    explain: 'গত প্রায় তিন মাসের গড় রক্তে শর্করার মাত্রা বোঝায় — ডায়াবেটিস দীর্ঘমেয়াদে কতটা নিয়ন্ত্রণে আছে তা দেখতে।',
    prices: one(300, SRC_DGHS_DMCH) },

  { id: 'creatinine', en: 'Serum Creatinine', abbr: 'S. Creatinine', bn: 'কিডনির কার্যক্ষমতার পরীক্ষা', category: 'kidney',
    explain: 'রক্তে ক্রিয়েটিনিনের মাত্রা মেপে কিডনি ঠিকমতো কাজ করছে কি না বোঝা যায়।',
    prices: one(50, SRC_DGHS_DMCH) },

  { id: 'alt', en: 'SGPT (ALT)', abbr: 'ALT', bn: 'লিভার এনজাইম পরীক্ষা', category: 'liver',
    explain: 'লিভারের কোষে কোনো ক্ষতি বা প্রদাহ হচ্ছে কি না বোঝার জন্য রক্তে এই এনজাইমের মাত্রা মাপা হয়।',
    prices: one(70, SRC_DGHS_DMCH) },

  { id: 'ast', en: 'SGOT (AST)', abbr: 'AST', bn: 'লিভার এনজাইম পরীক্ষা', category: 'liver',
    explain: 'ALT-এর মতোই — লিভার (এবং মাঝে মাঝে হৃদযন্ত্র/মাংসপেশি) কোষের ক্ষতি বোঝার আরেকটা এনজাইম পরীক্ষা, সাধারণত ALT-এর সাথে একসাথে করা হয়।',
    prices: one(70, SRC_DGHS_DMCH) },

  { id: 'lft', en: 'Liver Function Test', abbr: 'LFT', bn: 'লিভারের সার্বিক কার্যক্ষমতা পরীক্ষা', category: 'liver',
    explain: 'লিভার সংক্রান্ত একাধিক পরীক্ষা (বিলিরুবিন, এনজাইম, প্রোটিন ইত্যাদি) একসাথে করে লিভারের সার্বিক অবস্থা বোঝার প্যানেল।',
    prices: one(200, SRC_DGHS_DMCH, { notes: 'এই প্যানেলে ঠিক কোন কোন টেস্ট অন্তর্ভুক্ত তা উৎস নথিতে আলাদা করে তালিকা করা নেই।' }) },

  { id: 'cholesterol', en: 'Serum Cholesterol', abbr: 'S. Cholesterol', bn: 'রক্তে মোট কোলেস্টেরল', category: 'blood',
    explain: 'রক্তে মোট কোলেস্টেরলের মাত্রা — হৃদরোগের ঝুঁকি বোঝার একটা অংশ হিসেবে পরীক্ষা করা হয়।',
    prices: one(50, SRC_DGHS_DMCH, { notes: 'সম্পূর্ণ লিপিড প্রোফাইল (HDL/LDL-সহ) হিসেবে বান্ডেল মূল্য উৎস নথিতে পাওয়া যায়নি — এখানে শুধু মোট কোলেস্টেরলের এককভাবে উল্লেখিত মূল্য।' }) },

  { id: 'triglyceride', en: 'Triglyceride', abbr: 'TG', bn: 'রক্তে ট্রাইগ্লিসারাইড (এক ধরনের চর্বি)', category: 'blood',
    explain: 'রক্তে এক ধরনের চর্বির (ফ্যাট) মাত্রা মাপা হয় — এটাও হৃদরোগের ঝুঁকি মূল্যায়নের একটা অংশ।',
    prices: one(100, SRC_DGHS_DMCH) },

  { id: 'urine-rme', en: 'Urine R/M/E', abbr: 'Urine R/E', bn: 'প্রস্রাব পরীক্ষা', category: 'urine',
    explain: 'প্রস্রাবে সংক্রমণ, প্রোটিন, চিনি বা রক্তের উপস্থিতি আছে কি না — একটা সাধারণ, দ্রুত পরীক্ষা।',
    prices: one(20, SRC_DGHS_DMCH) },

  { id: 'stool-rme', en: 'Stool R/M/E', abbr: 'Stool R/E', bn: 'মল পরীক্ষা', category: 'urine',
    explain: 'মলে পরজীবী (কৃমি), রক্ত বা সংক্রমণের চিহ্ন আছে কি না দেখার জন্য করা হয়।',
    prices: one(20, SRC_DGHS_DMCH) },

  { id: 'tsh', en: 'TSH', abbr: 'TSH', bn: 'থাইরয়েড উদ্দীপক হরমোন পরীক্ষা', category: 'thyroid',
    explain: 'থাইরয়েড গ্রন্থি ঠিকমতো কাজ করছে কি না বোঝার সবচেয়ে সাধারণ প্রাথমিক পরীক্ষা।',
    prices: one(200, SRC_DGHS_DMCH) },

  { id: 't3', en: 'Total T3', abbr: 'T3', bn: 'থাইরয়েড হরমোন (T3) পরীক্ষা', category: 'thyroid',
    explain: 'থাইরয়েড গ্রন্থি থেকে নিঃসৃত একটা হরমোনের মাত্রা — সাধারণত TSH-এর সাথে প্রয়োজন হলে করা হয়।',
    prices: one(200, SRC_DGHS_DMCH) },

  { id: 't4', en: 'Total T4', abbr: 'T4', bn: 'থাইরয়েড হরমোন (T4) পরীক্ষা', category: 'thyroid',
    explain: 'থাইরয়েড গ্রন্থির আরেকটা প্রধান হরমোনের মাত্রা — থাইরয়েডের সমস্যা নির্ণয়ে সাহায্য করে।',
    prices: one(200, SRC_DGHS_DMCH) },

  { id: 'dengue', en: 'Dengue (NS1/IgG/IgM)', abbr: 'Dengue', bn: 'ডেঙ্গু পরীক্ষা', category: 'infection',
    explain: 'জ্বরের সাথে ডেঙ্গু ভাইরাসের সংক্রমণ হয়েছে কি না নিশ্চিত করতে NS1 (প্রথম দিকে) বা IgG/IgM (পরে) অ্যান্টিবডি পরীক্ষা করা হয়।',
    prices: [
      { amount: 50, status: 'needs_reverify', ...SRC_DGHS_DENGUE_2025, notes: 'NS1, IgG, IgM — প্রতিটার জন্য আলাদাভাবে ৳৫০। ' + SRC_DGHS_DENGUE_2025.notes },
      { amount: 300, status: 'needs_reverify', ...SRC_DGHS_DMCH, notes: 'এই পুরনো তালিকায় "Dengue" একটাই এন্ট্রি হিসেবে আছে (NS1/IgG/IgM আলাদা করে উল্লেখ নেই) — ২০২৫ সালের সার্কুলারের সাথে না মেলায় এটা সম্ভবত পুরনো/প্রতিস্থাপিত মূল্য।' },
    ] },

  { id: 'widal', en: 'Widal Test', abbr: 'Widal', bn: 'টাইফয়েড জ্বর পরীক্ষা', category: 'infection',
    explain: 'টাইফয়েড জ্বরের সন্দেহ হলে করা একটা প্রচলিত পরীক্ষা (যদিও আধুনিক চিকিৎসায় এর নির্ভরযোগ্যতা নিয়ে প্রশ্ন আছে বলে অনেক চিকিৎসক আলাদা পরীক্ষাও পরামর্শ দেন)।',
    prices: one(80, SRC_DGHS_DMCH) },

  { id: 'vdrl', en: 'VDRL', abbr: 'VDRL', bn: 'সিফিলিস স্ক্রিনিং পরীক্ষা', category: 'infection',
    explain: 'সিফিলিস সংক্রমণ আছে কি না প্রাথমিকভাবে স্ক্রিনিং করার জন্য — প্রায়ই গর্ভাবস্থার রুটিন পরীক্ষার অংশ হিসেবে করা হয়।',
    prices: one(50, SRC_DGHS_DMCH) },

  { id: 'hbsag', en: 'HBsAg', abbr: 'HBsAg', bn: 'হেপাটাইটিস-বি স্ক্রিনিং', category: 'infection',
    explain: 'হেপাটাইটিস-বি ভাইরাসের সংক্রমণ আছে কি না দেখার জন্য — অস্ত্রোপচার বা গর্ভাবস্থার আগে প্রায়ই করা হয়।',
    prices: one(150, SRC_DGHS_DMCH) },

  { id: 'anti-hcv', en: 'Anti-HCV', abbr: 'HCV', bn: 'হেপাটাইটিস-সি স্ক্রিনিং', category: 'infection',
    explain: 'হেপাটাইটিস-সি ভাইরাসের সংক্রমণ হয়েছে কি না স্ক্রিনিং করার পরীক্ষা।',
    prices: one(350, SRC_DGHS_DMCH) },

  { id: 'hiv', en: 'HIV', abbr: 'HIV', bn: 'এইচআইভি স্ক্রিনিং', category: 'infection',
    explain: 'এইচআইভি সংক্রমণ আছে কি না স্ক্রিনিং করার পরীক্ষা — গোপনীয়তা ও কাউন্সেলিং সহ করানো উচিত।',
    prices: one(300, SRC_DGHS_DMCH) },

  { id: 'crp', en: 'CRP', abbr: 'CRP', bn: 'শরীরে প্রদাহের সূচক', category: 'infection',
    explain: 'শরীরে কোনো সংক্রমণ বা প্রদাহ (ইনফ্ল্যামেশন) চলছে কি না, আর কতটা সক্রিয় — তার একটা সাধারণ ইঙ্গিত দেয়।',
    prices: one(150, SRC_DGHS_DMCH) },

  { id: 'pregnancy', en: 'Pregnancy Test', abbr: 'UPT', bn: 'গর্ভাবস্থা পরীক্ষা', category: 'infection',
    explain: 'প্রস্রাবে hCG হরমোনের উপস্থিতি দেখে গর্ভধারণ হয়েছে কি না নিশ্চিত করার দ্রুত পরীক্ষা।',
    prices: one(80, SRC_DGHS_DMCH) },
];
