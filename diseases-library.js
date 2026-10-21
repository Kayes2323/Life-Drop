// ══════════════════════════════════════════════════════════
// Sondhan Health — রোগসমূহ: লাইব্রেরি ইনডেক্স (হালকা, শুধু কার্ড/সার্চ/ফিল্টারের জন্য)
//
// উৎস: Sondhan Disease Encyclopedia (PDF, ৪ পর্ব, মোট ১০৭ পৃষ্ঠা, ২৬টি রোগ)।
// প্রতিটা entry-র সার-সংক্ষেপ (summary) সরাসরি PDF-এর "কারণ" ও "লক্ষণ" অংশ থেকে
// নেওয়া/সংক্ষেপিত — কোনো নতুন তথ্য যোগ করা হয়নি।
//
// পূর্ণ আর্টিকেল (causes/symptoms/riskFactors/food/habits/emergency ইত্যাদি)
// এখানে নেই — সেগুলো diseases-content.js-এ, শুধু disease.html (বিস্তারিত পেজ)
// খোলার সময় dynamic import হয়, যাতে লাইব্রেরি পেজ হালকা থাকে।
//
// প্রতিটা রোগ 'চিকিৎসক-পর্যালোচনা বাকি' — PDF নিজেই বলে এটি "প্রাথমিক
// জনস্বাস্থ্যশিক্ষা খসড়া, ক্লিনিক্যাল নির্দেশিকা নয়" এবং "চিকিৎসক-অনুমোদন: বাকি"।
// তাই কোনো lastReviewed তারিখ এখানে বসানো হয়নি (PDF-এর "শেষ যাচাই" তারিখ একটা
// খসড়া-প্রস্তুতির তারিখ, চিকিৎসক-পর্যালোচনার তারিখ নয়)।
// ══════════════════════════════════════════════════════════

export const DZ_CATEGORIES = [
  { id: 'infectious',  label: 'সংক্রামক রোগ' },
  { id: 'chronic',     label: 'দীর্ঘমেয়াদি রোগ' },
  { id: 'cardio',      label: 'হৃদ্‌রোগ ও রক্তনালির রোগ' },
  { id: 'respiratory', label: 'শ্বাসতন্ত্রের রোগ' },
  { id: 'digestive',   label: 'পরিপাকতন্ত্রের রোগ' },
  { id: 'mental',      label: 'মানসিক স্বাস্থ্য' },
  { id: 'other',       label: 'অন্যান্য' },
];

export const DISEASES = [
  { slug: 'dengue', nameBn: 'ডেঙ্গু জ্বর', nameEn: 'Dengue', aliases: ['ডেঙ্গু'], category: 'infectious',
    summary: 'মশাবাহিত ভাইরাস সংক্রমণ; হঠাৎ তীব্র জ্বর, শরীর-গাঁটে ব্যথা ও র‍্যাশ দেখা দেয়।' },

  { slug: 'type-2-diabetes', nameBn: 'টাইপ ২ ডায়াবেটিস', nameEn: 'Type 2 diabetes', aliases: ['ডায়াবেটিস', 'সুগার'], category: 'chronic',
    summary: 'ইনসুলিনের কার্যকারিতা কমে রক্তে শর্করা বেড়ে যাওয়া; বেশি পিপাসা-প্রস্রাব হতে পারে, অনেকের লক্ষণ থাকে না।' },

  { slug: 'hypertension', nameBn: 'উচ্চ রক্তচাপ', nameEn: 'Hypertension', aliases: ['প্রেসার', 'হাই ব্লাড প্রেসার'], category: 'cardio',
    summary: 'দীর্ঘদিন রক্তনালিতে চাপ বেশি থাকা; সাধারণত লক্ষণহীন, মাপলেই ধরা পড়ে।' },

  { slug: 'tuberculosis', nameBn: 'যক্ষ্মা (টিবি)', nameEn: 'Tuberculosis', aliases: ['টিবি', 'TB'], category: 'infectious',
    summary: 'বাতাসের মাধ্যমে ছড়ানো ব্যাকটেরিয়াল সংক্রমণ; দুই সপ্তাহের বেশি কাশি, জ্বর ও ওজন কমা।' },

  { slug: 'asthma', nameBn: 'অ্যাজমা', nameEn: 'Asthma', aliases: ['হাঁপানি'], category: 'respiratory',
    summary: 'শ্বাসনালির দীর্ঘস্থায়ী প্রদাহ; শো-শো শব্দ, কাশি ও শ্বাসকষ্ট হয়।' },

  { slug: 'pneumonia', nameBn: 'নিউমোনিয়া', nameEn: 'Pneumonia', aliases: ['ফুসফুসের সংক্রমণ'], category: 'respiratory',
    summary: 'ফুসফুসের সংক্রমণ; কাশি, জ্বর, শ্বাসকষ্ট ও বুকব্যথা হয়।' },

  { slug: 'hepatitis-b', nameBn: 'হেপাটাইটিস বি', nameEn: 'Hepatitis B', aliases: ['Hep B'], category: 'infectious',
    summary: 'হেপাটাইটিস বি ভাইরাস সংক্রমণ; অনেকের লক্ষণ নেই, কারও ক্লান্তি-জন্ডিস হতে পারে।' },

  { slug: 'coronary-artery-disease', nameBn: 'করোনারি আর্টারি ডিজিজ', nameEn: 'Coronary artery disease', aliases: ['CAD', 'হৃদরোগ'], category: 'cardio',
    summary: 'হৃদপিণ্ডের ধমনিতে চর্বি জমে সরু হওয়া; পরিশ্রমে বুকে চাপ ও শ্বাসকষ্ট হতে পারে।' },

  { slug: 'heart-attack', nameBn: 'হার্ট অ্যাটাক', nameEn: 'Heart attack', aliases: ['Myocardial infarction'], category: 'cardio',
    summary: 'হৃদপেশিতে রক্তপ্রবাহ হঠাৎ বন্ধ হওয়া; বুকে চাপ, ঘাম, শ্বাসকষ্ট — জরুরি অবস্থা।' },

  { slug: 'stroke', nameBn: 'স্ট্রোক', nameEn: 'Stroke', aliases: ['ব্রেন স্ট্রোক', 'প্যারালাইসিস'], category: 'cardio',
    summary: 'মস্তিষ্কে রক্তপ্রবাহ বন্ধ বা রক্তক্ষরণ; মুখ বেঁকে যাওয়া, একপাশ দুর্বল, কথা জড়িয়ে যাওয়া — জরুরি অবস্থা।' },

  { slug: 'chronic-kidney-disease', nameBn: 'দীর্ঘস্থায়ী কিডনি রোগ', nameEn: 'Chronic kidney disease', aliases: ['CKD', 'কিডনি রোগ'], category: 'chronic',
    summary: 'কিডনির কার্যকারিতা দীর্ঘসময় ধরে কমে যাওয়া; শুরুতে লক্ষণ নাও থাকতে পারে।' },

  { slug: 'anaemia', nameBn: 'রক্তশূন্যতা', nameEn: 'Anaemia', aliases: ['Anemia'], category: 'chronic',
    summary: 'হিমোগ্লোবিন/লোহিত রক্তকণিকা কমে যাওয়া; ক্লান্তি, ফ্যাকাশে ভাব ও মাথা ঘোরা হয়।' },

  { slug: 'migraine', nameBn: 'মাইগ্রেন', nameEn: 'Migraine', aliases: ['আধকপালি'], category: 'other',
    summary: 'পুনরাবৃত্ত স্নায়বিক মাথাব্যথা; বমিভাব ও আলো-শব্দে অস্বস্তি হতে পারে।' },

  { slug: 'gerd', nameBn: 'অ্যাসিড রিফ্লাক্স/GERD', nameEn: 'GERD', aliases: ['Acid reflux', 'গ্যাস্ট্রিক'], category: 'digestive',
    summary: 'পাকস্থলীর উপাদান খাদ্যনালিতে ফিরে আসা; বুকজ্বালা ও টক ঢেকুর হয়।' },

  { slug: 'hypothyroidism', nameBn: 'হাইপোথাইরয়েডিজম', nameEn: 'Hypothyroidism', aliases: ['থাইরয়েড'], category: 'chronic',
    summary: 'থাইরয়েড হরমোন কম উৎপাদন; ক্লান্তি, ঠান্ডা বেশি লাগা ও ওজন বাড়তে পারে।' },

  { slug: 'hyperthyroidism', nameBn: 'হাইপারথাইরয়েডিজম', nameEn: 'Hyperthyroidism', aliases: ['থাইরয়েড'], category: 'chronic',
    summary: 'থাইরয়েড হরমোন অতিরিক্ত উৎপাদন; হৃদস্পন্দন দ্রুত, হাত কাঁপা ও ওজন কমা।' },

  { slug: 'diarrhoea', nameBn: 'ডায়রিয়া', nameEn: 'Diarrhoea', aliases: ['Diarrhea', 'পাতলা পায়খানা'], category: 'digestive',
    summary: 'সংক্রমণ বা দূষিত খাবার/পানি থেকে বারবার পাতলা পায়খানা; পানিশূন্যতার ঝুঁকি থাকে।' },

  { slug: 'malaria', nameBn: 'ম্যালেরিয়া', nameEn: 'Malaria', aliases: [], category: 'infectious',
    summary: 'সংক্রমিত মশার মাধ্যমে পরজীবী সংক্রমণ; জ্বর, কাঁপুনি ও ঘাম হয়।' },

  { slug: 'chikungunya', nameBn: 'চিকুনগুনিয়া', nameEn: 'Chikungunya', aliases: [], category: 'infectious',
    summary: 'মশাবাহিত ভাইরাস সংক্রমণ; জ্বর ও তীব্র গিঁটব্যথা, যা দীর্ঘস্থায়ী হতে পারে।' },

  { slug: 'ringworm', nameBn: 'দাদ/রিংওয়ার্ম', nameEn: 'Ringworm', aliases: ['দাদ'], category: 'infectious',
    summary: 'ত্বকের ছত্রাক সংক্রমণ; চুলকানিযুক্ত গোলাকার খসখসে দাগ হয়।' },

  { slug: 'scabies', nameBn: 'খোসপাঁচড়া', nameEn: 'Scabies', aliases: [], category: 'infectious',
    summary: 'ত্বকে ক্ষুদ্র মাইটের সংক্রমণ; বিশেষত রাতে তীব্র চুলকানি হয়।' },

  { slug: 'influenza', nameBn: 'ইনফ্লুয়েঞ্জা', nameEn: 'Influenza', aliases: ['ফ্লু', 'Flu'], category: 'respiratory',
    summary: 'ইনফ্লুয়েঞ্জা ভাইরাস সংক্রমণ; হঠাৎ জ্বর, শরীরব্যথা ও কাশি হয়।' },

  { slug: 'covid-19', nameBn: 'কোভিড-১৯', nameEn: 'COVID-19', aliases: ['করোনা', 'Corona'], category: 'respiratory',
    summary: 'SARS-CoV-2 ভাইরাস সংক্রমণ; জ্বর, কাশি ও গলাব্যথা, কখনও শ্বাসকষ্ট।' },

  { slug: 'depression', nameBn: 'বিষণ্নতা', nameEn: 'Depression', aliases: [], category: 'mental',
    summary: 'মেজাজ ও দৈনন্দিন কার্যক্ষমতায় প্রভাব ফেলা মানসিক স্বাস্থ্য অবস্থা; দুর্বল চরিত্রের প্রমাণ নয়।' },

  { slug: 'epilepsy', nameBn: 'মৃগী', nameEn: 'Epilepsy', aliases: ['খিঁচুনি রোগ'], category: 'other',
    summary: 'মস্তিষ্কে পুনরাবৃত্ত খিঁচুনির প্রবণতা; অনেক ক্ষেত্রে কারণ অজানা থাকে।' },

  { slug: 'obesity', nameBn: 'স্থূলতা', nameEn: 'Obesity', aliases: ['ওজনাধিক্য'], category: 'chronic',
    summary: 'শরীরে অতিরিক্ত চর্বি জমে স্বাস্থ্যঝুঁকি বাড়া; জটিল বহু-কারণীয় অবস্থা, শুধু ইচ্ছাশক্তির সমস্যা নয়।' },
];
