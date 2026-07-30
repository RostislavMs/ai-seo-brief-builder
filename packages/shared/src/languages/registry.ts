/**
 * Реєстр мов, до яких можна писати правила.
 *
 * Перелік — увесь ISO 639-1 (183 коди; колективного `bh` немає, ISO вивів
 * його з обігу), а не «мови, які ми бачили»: правила пишуться під конкретну
 * мову заздалегідь, і зустріти в списку власну мову має кожен, хто прийде
 * з нею. Обрізаний перелік означав би, що для грузинських конкурентів
 * правило додати неможливо, доки хтось не допише код у файл.
 *
 * Реєстр живе в коді, а не в базі: він статичний, однаковий для всіх
 * і потрібен обом сторонам — сервер визначає ним мову зі `<html lang>`,
 * фронт малює з нього список вибору.
 *
 * `name` — англійська назва: саме вона йде в промпт і в поле
 * `SeoBrief.contentLanguage`. `nativeName` — самоназва, потрібна лише
 * інтерфейсу: «Українська» у списку знаходять швидше, ніж «Ukrainian».
 */

export interface LanguageEntry {
  /** Код ISO 639-1, два малих латинських символи. */
  code: string;
  /** Англійська назва — те, що розуміє модель. */
  name: string;
  /** Самоназва — для списку вибору в інтерфейсі. */
  nativeName: string;
}

/**
 * Відсортовано за англійською назвою: у такому порядку список і показується,
 * а сортувати його на кожен рендер немає сенсу.
 */
export const LANGUAGES: readonly LanguageEntry[] = [
  { code: "ab", name: "Abkhazian", nativeName: "аҧсуа бызшәа" },
  { code: "aa", name: "Afar", nativeName: "Afaraf" },
  { code: "af", name: "Afrikaans", nativeName: "Afrikaans" },
  { code: "ak", name: "Akan", nativeName: "Akan" },
  { code: "sq", name: "Albanian", nativeName: "Shqip" },
  { code: "am", name: "Amharic", nativeName: "አማርኛ" },
  { code: "ar", name: "Arabic", nativeName: "العربية" },
  { code: "an", name: "Aragonese", nativeName: "aragonés" },
  { code: "hy", name: "Armenian", nativeName: "Հայերեն" },
  { code: "as", name: "Assamese", nativeName: "অসমীয়া" },
  { code: "av", name: "Avaric", nativeName: "авар мацӀ" },
  { code: "ae", name: "Avestan", nativeName: "avesta" },
  { code: "ay", name: "Aymara", nativeName: "aymar aru" },
  { code: "az", name: "Azerbaijani", nativeName: "azərbaycan dili" },
  { code: "bm", name: "Bambara", nativeName: "bamanankan" },
  { code: "ba", name: "Bashkir", nativeName: "башҡорт теле" },
  { code: "eu", name: "Basque", nativeName: "euskara" },
  { code: "be", name: "Belarusian", nativeName: "беларуская мова" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা" },
  { code: "bi", name: "Bislama", nativeName: "Bislama" },
  { code: "bs", name: "Bosnian", nativeName: "bosanski jezik" },
  { code: "br", name: "Breton", nativeName: "brezhoneg" },
  { code: "bg", name: "Bulgarian", nativeName: "български език" },
  { code: "my", name: "Burmese", nativeName: "ဗမာစာ" },
  { code: "ca", name: "Catalan", nativeName: "català" },
  { code: "ch", name: "Chamorro", nativeName: "Chamoru" },
  { code: "ce", name: "Chechen", nativeName: "нохчийн мотт" },
  { code: "ny", name: "Chichewa", nativeName: "chiCheŵa" },
  { code: "zh", name: "Chinese", nativeName: "中文" },
  { code: "cu", name: "Church Slavonic", nativeName: "ѩзыкъ словѣньскъ" },
  { code: "cv", name: "Chuvash", nativeName: "чӑваш чӗлхи" },
  { code: "kw", name: "Cornish", nativeName: "Kernewek" },
  { code: "co", name: "Corsican", nativeName: "corsu" },
  { code: "cr", name: "Cree", nativeName: "ᓀᐦᐃᔭᐍᐏᐣ" },
  { code: "hr", name: "Croatian", nativeName: "hrvatski jezik" },
  { code: "cs", name: "Czech", nativeName: "čeština" },
  { code: "da", name: "Danish", nativeName: "dansk" },
  { code: "dv", name: "Divehi", nativeName: "ދިވެހި" },
  { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  { code: "dz", name: "Dzongkha", nativeName: "རྫོང་ཁ" },
  { code: "en", name: "English", nativeName: "English" },
  { code: "eo", name: "Esperanto", nativeName: "Esperanto" },
  { code: "et", name: "Estonian", nativeName: "eesti" },
  { code: "ee", name: "Ewe", nativeName: "Eʋegbe" },
  { code: "fo", name: "Faroese", nativeName: "føroyskt" },
  { code: "fj", name: "Fijian", nativeName: "vosa Vakaviti" },
  { code: "fi", name: "Finnish", nativeName: "suomi" },
  { code: "fr", name: "French", nativeName: "français" },
  { code: "ff", name: "Fulah", nativeName: "Fulfulde" },
  { code: "gl", name: "Galician", nativeName: "galego" },
  { code: "lg", name: "Ganda", nativeName: "Luganda" },
  { code: "ka", name: "Georgian", nativeName: "ქართული" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "el", name: "Greek", nativeName: "Ελληνικά" },
  { code: "gn", name: "Guarani", nativeName: "Avañe'ẽ" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી" },
  { code: "ht", name: "Haitian Creole", nativeName: "Kreyòl ayisyen" },
  { code: "ha", name: "Hausa", nativeName: "هَوُسَ" },
  { code: "he", name: "Hebrew", nativeName: "עברית" },
  { code: "hz", name: "Herero", nativeName: "Otjiherero" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "ho", name: "Hiri Motu", nativeName: "Hiri Motu" },
  { code: "hu", name: "Hungarian", nativeName: "magyar" },
  { code: "is", name: "Icelandic", nativeName: "Íslenska" },
  { code: "io", name: "Ido", nativeName: "Ido" },
  { code: "ig", name: "Igbo", nativeName: "Asụsụ Igbo" },
  { code: "id", name: "Indonesian", nativeName: "Bahasa Indonesia" },
  { code: "ia", name: "Interlingua", nativeName: "Interlingua" },
  { code: "ie", name: "Interlingue", nativeName: "Interlingue" },
  { code: "iu", name: "Inuktitut", nativeName: "ᐃᓄᒃᑎᑐᑦ" },
  { code: "ik", name: "Inupiaq", nativeName: "Iñupiaq" },
  { code: "ga", name: "Irish", nativeName: "Gaeilge" },
  { code: "it", name: "Italian", nativeName: "italiano" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "jv", name: "Javanese", nativeName: "basa Jawa" },
  { code: "kl", name: "Kalaallisut", nativeName: "kalaallisut" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { code: "kr", name: "Kanuri", nativeName: "Kanuri" },
  { code: "ks", name: "Kashmiri", nativeName: "कश्मीरी" },
  { code: "kk", name: "Kazakh", nativeName: "қазақ тілі" },
  { code: "km", name: "Khmer", nativeName: "ខ្មែរ" },
  { code: "ki", name: "Kikuyu", nativeName: "Gĩkũyũ" },
  { code: "rw", name: "Kinyarwanda", nativeName: "Ikinyarwanda" },
  { code: "rn", name: "Kirundi", nativeName: "Ikirundi" },
  { code: "kv", name: "Komi", nativeName: "коми кыв" },
  { code: "kg", name: "Kongo", nativeName: "Kikongo" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "kj", name: "Kuanyama", nativeName: "Kuanyama" },
  { code: "ku", name: "Kurdish", nativeName: "Kurdî" },
  { code: "ky", name: "Kyrgyz", nativeName: "Кыргызча" },
  { code: "lo", name: "Lao", nativeName: "ພາສາລາວ" },
  { code: "la", name: "Latin", nativeName: "latine" },
  { code: "lv", name: "Latvian", nativeName: "latviešu valoda" },
  { code: "li", name: "Limburgish", nativeName: "Limburgs" },
  { code: "ln", name: "Lingala", nativeName: "Lingála" },
  { code: "lt", name: "Lithuanian", nativeName: "lietuvių kalba" },
  { code: "lu", name: "Luba-Katanga", nativeName: "Kiluba" },
  { code: "lb", name: "Luxembourgish", nativeName: "Lëtzebuergesch" },
  { code: "mk", name: "Macedonian", nativeName: "македонски јазик" },
  { code: "mg", name: "Malagasy", nativeName: "fiteny malagasy" },
  { code: "ms", name: "Malay", nativeName: "Bahasa Melayu" },
  { code: "ml", name: "Malayalam", nativeName: "മലയാളം" },
  { code: "mt", name: "Maltese", nativeName: "Malti" },
  { code: "gv", name: "Manx", nativeName: "Gaelg" },
  { code: "mi", name: "Maori", nativeName: "te reo Māori" },
  { code: "mr", name: "Marathi", nativeName: "मराठी" },
  { code: "mh", name: "Marshallese", nativeName: "Kajin M̧ajeļ" },
  { code: "mn", name: "Mongolian", nativeName: "Монгол хэл" },
  { code: "na", name: "Nauru", nativeName: "Dorerin Naoero" },
  { code: "nv", name: "Navajo", nativeName: "Diné bizaad" },
  { code: "ng", name: "Ndonga", nativeName: "Owambo" },
  { code: "ne", name: "Nepali", nativeName: "नेपाली" },
  { code: "nd", name: "North Ndebele", nativeName: "isiNdebele" },
  { code: "se", name: "Northern Sami", nativeName: "Davvisámegiella" },
  { code: "no", name: "Norwegian", nativeName: "Norsk" },
  { code: "nb", name: "Norwegian Bokmål", nativeName: "Norsk bokmål" },
  { code: "nn", name: "Norwegian Nynorsk", nativeName: "Norsk nynorsk" },
  { code: "oc", name: "Occitan", nativeName: "occitan" },
  { code: "or", name: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { code: "oj", name: "Ojibwe", nativeName: "ᐊᓂᔑᓈᐯᒧᐎᓐ" },
  { code: "om", name: "Oromo", nativeName: "Afaan Oromoo" },
  { code: "os", name: "Ossetian", nativeName: "ирон æвзаг" },
  { code: "pi", name: "Pali", nativeName: "पालि" },
  { code: "ps", name: "Pashto", nativeName: "پښتو" },
  { code: "fa", name: "Persian", nativeName: "فارسی" },
  { code: "pl", name: "Polish", nativeName: "polski" },
  { code: "pt", name: "Portuguese", nativeName: "português" },
  { code: "pa", name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { code: "qu", name: "Quechua", nativeName: "Runa Simi" },
  { code: "ro", name: "Romanian", nativeName: "română" },
  { code: "rm", name: "Romansh", nativeName: "rumantsch grischun" },
  { code: "ru", name: "Russian", nativeName: "русский" },
  { code: "sm", name: "Samoan", nativeName: "gagana fa'a Samoa" },
  { code: "sg", name: "Sango", nativeName: "yângâ tî sängö" },
  { code: "sa", name: "Sanskrit", nativeName: "संस्कृतम्" },
  { code: "sc", name: "Sardinian", nativeName: "sardu" },
  { code: "gd", name: "Scottish Gaelic", nativeName: "Gàidhlig" },
  { code: "sr", name: "Serbian", nativeName: "српски језик" },
  { code: "sn", name: "Shona", nativeName: "chiShona" },
  { code: "ii", name: "Sichuan Yi", nativeName: "ꆈꌠ꒿ Nuosuhxop" },
  { code: "sd", name: "Sindhi", nativeName: "सिन्धी" },
  { code: "si", name: "Sinhala", nativeName: "සිංහල" },
  { code: "sk", name: "Slovak", nativeName: "slovenčina" },
  { code: "sl", name: "Slovenian", nativeName: "slovenščina" },
  { code: "so", name: "Somali", nativeName: "Soomaaliga" },
  { code: "nr", name: "South Ndebele", nativeName: "isiNdebele" },
  { code: "st", name: "Southern Sotho", nativeName: "Sesotho" },
  { code: "es", name: "Spanish", nativeName: "español" },
  { code: "su", name: "Sundanese", nativeName: "Basa Sunda" },
  { code: "sw", name: "Swahili", nativeName: "Kiswahili" },
  { code: "ss", name: "Swati", nativeName: "SiSwati" },
  { code: "sv", name: "Swedish", nativeName: "svenska" },
  { code: "tl", name: "Tagalog", nativeName: "Wikang Tagalog" },
  { code: "ty", name: "Tahitian", nativeName: "Reo Tahiti" },
  { code: "tg", name: "Tajik", nativeName: "тоҷикӣ" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்" },
  { code: "tt", name: "Tatar", nativeName: "татар теле" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు" },
  { code: "th", name: "Thai", nativeName: "ไทย" },
  { code: "bo", name: "Tibetan", nativeName: "བོད་ཡིག" },
  { code: "ti", name: "Tigrinya", nativeName: "ትግርኛ" },
  { code: "to", name: "Tongan", nativeName: "faka Tonga" },
  { code: "ts", name: "Tsonga", nativeName: "Xitsonga" },
  { code: "tn", name: "Tswana", nativeName: "Setswana" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe" },
  { code: "tk", name: "Turkmen", nativeName: "Türkmençe" },
  { code: "tw", name: "Twi", nativeName: "Twi" },
  { code: "uk", name: "Ukrainian", nativeName: "Українська" },
  { code: "ur", name: "Urdu", nativeName: "اردو" },
  { code: "ug", name: "Uyghur", nativeName: "ئۇيغۇرچە" },
  { code: "uz", name: "Uzbek", nativeName: "Oʻzbek" },
  { code: "ve", name: "Venda", nativeName: "Tshivenḓa" },
  { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
  { code: "vo", name: "Volapük", nativeName: "Volapük" },
  { code: "wa", name: "Walloon", nativeName: "walon" },
  { code: "cy", name: "Welsh", nativeName: "Cymraeg" },
  { code: "fy", name: "Western Frisian", nativeName: "Frysk" },
  { code: "wo", name: "Wolof", nativeName: "Wollof" },
  { code: "xh", name: "Xhosa", nativeName: "isiXhosa" },
  { code: "yi", name: "Yiddish", nativeName: "ייִדיש" },
  { code: "yo", name: "Yoruba", nativeName: "Yorùbá" },
  { code: "za", name: "Zhuang", nativeName: "Saɯ cueŋƅ" },
  { code: "zu", name: "Zulu", nativeName: "isiZulu" },
];

const BY_CODE = new Map(LANGUAGES.map((entry) => [entry.code, entry]));

/** Англійська назва → код. Назви в реєстрі унікальні, тому зворотний пошук однозначний. */
const BY_NAME = new Map(
  LANGUAGES.map((entry) => [entry.name.toLowerCase(), entry]),
);

/**
 * Застарілі коди, які досі трапляються в `<html lang>` на живих сайтах.
 * ISO їх перейменував, браузери й CMS — не завжди.
 */
const ALIASES: Record<string, string> = {
  iw: "he",
  in: "id",
  ji: "yi",
  mo: "ro",
};

export function languageByCode(code: string): LanguageEntry | null {
  return BY_CODE.get(code.toLowerCase()) ?? null;
}

export function isLanguageCode(code: string): boolean {
  return BY_CODE.has(code.toLowerCase());
}

/**
 * Англійська назва мови за кодом. Для невідомого коду повертає сам код:
 * порожній рядок у промпті або в інтерфейсі гірший за «xx».
 */
export function languageName(code: string): string {
  return languageByCode(code)?.name ?? code;
}

/**
 * Код за англійською назвою — потрібен там, де мова відома лише назвою
 * (`SeoBrief.contentLanguage`), а правила лежать під кодом.
 */
export function languageCodeByName(name: string): string | null {
  return BY_NAME.get(name.trim().toLowerCase())?.code ?? null;
}

/**
 * Значення `<html lang>` → код ISO 639-1: `"it-IT"` → `"it"`, `"iw"` → `"he"`.
 * null — тег відсутній, зіпсований або позначає мову поза 639-1.
 */
export function normalizeLanguageTag(tag: string | null | undefined): string | null {
  const primary = tag?.trim().toLowerCase().split(/[-_]/)[0];
  if (!primary) return null;

  const code = ALIASES[primary] ?? primary;
  return BY_CODE.has(code) ? code : null;
}
