import type { Marja, Topic, Language, Citation } from '@sjn/shared';
import { AppError } from '../errors.js';
export function normalize(text: string) {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}
export class QuestionClassifier {
  needsClarification(question: string) {
    // Unknown subject matter is not ambiguity. Only match requests with no subject
    // or an unresolved reference; never use the topic label as a clarity test.
    const q = normalize(question)
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();
    return (
      !q ||
      /^(?:what|why|how|explain|tell me|help|what about (?:it|this|that)|explain (?:it|this|that)|tell me about (?:it|this|that)|کیا|کیوں|کیسے|بتائیں|وضاحت کریں|اس کے بارے میں بتائیں|یہ کیا ہے|kya|kyun|kaise|batayein|is ke bare mein batayein|yeh kya hai)$/.test(
        q,
      )
    );
  }
  classify(question: string): Topic {
    const q = normalize(question);
    if (
      /\b(fiqh|fiqhf|jurisprudence|marja|pray|prayer|prayers|namaz|salah|salaat|wudu|wudhu|wuzu|ablution|fast|fasting|roza|rozay|khums|zakat|halal|haram|permissible|allowed|ruling|fatwa|fatwas|taqlid|taqleed|ghusl|nikah|divorce|inheritance|najis|taharat|hajj|wajib|obligatory|mustahab|makruh)\b|فقہ|فتوی|مرجع|واجب|مکروہ|نماز|وضو|روزہ|روزے|خمس|زکات|حلال|حرام|جائز|حکم|تقلید|غسل|نکاح|طلاق|نجس/.test(
        q,
      )
    )
      return 'FIQH';
    if (/quran|qur'an|tafsir|surah|ayat|قرآن|تفسیر|سورہ|آیت/.test(q)) return 'QURAN';
    if (/hadith|hadees|حدیث/.test(q)) return 'HADITH';
    if (
      /akhlaq|ikhlaq|kindness|patience|sabr|honesty|gratitude|education|learning|character|taleem|tarbiyat|اخلاق|صبر|شکر|تعلیم|تربیت|علم/.test(
        q,
      )
    )
      return 'AKHLAQ';
    if (/aqaid|belief|tawhid|imamat|imamate|عقائد|توحید|امامت/.test(q)) return 'AQAID';
    if (/history|karbala|historical|تاریخ|کربلا/.test(q)) return 'HISTORY';
    return 'OTHER';
  }
  language(question: string, preferred: Language): Language {
    if (/(?:answer|reply|respond)\s+in\s+english/i.test(question)) return 'en';
    if (/(?:answer|reply|respond)\s+in\s+roman\s+urdu/i.test(question)) return 'roman';
    if (/(?:answer|reply|respond)\s+in\s+urdu|اردو میں جواب/i.test(question)) return 'ur';
    return preferred;
  }
  deceasedTaqlid(question: string) {
    return (
      /taqlid|taqleed|تقلید/i.test(question) &&
      /dead|deceased|khamenei|خامنه|خامنہ|فوت|مرحوم|وفات|commenc|continu|شروع|جاری/i.test(question)
    );
  }
}
export class SourceAuthorityResolver {
  resolve(category: Topic, marja: Marja) {
    return {
      approvalStatus: 'APPROVED',
      sourceCategory: category === 'FIQH' ? 'FIQH' : 'EDUCATIONAL',
      religiousAuthorityId: category === 'FIQH' ? marja : 'JAWAD_NAQVI',
      ...(category === 'OTHER' ? {} : { topics: category }),
    } as const;
  }
}
export class CitationValidator {
  validate(ids: string[], retrieved: Citation[]) {
    if (ids.length === 0 || new Set(ids).size !== ids.length)
      throw new AppError(
        502,
        'INVALID_CITATIONS',
        'The answer could not be verified against its sources.',
      );
    const result = ids.map((id) => retrieved.find((c) => c.chunkId === id));
    if (result.some((c) => !c))
      throw new AppError(
        502,
        'INVALID_CITATIONS',
        'The answer cited material that was not retrieved.',
      );
    return result as Citation[];
  }
}
export const messages = {
  fiqhPaused: {
    en: 'Fiqh and Marja-specific rulings are not available in this phase. SJN currently supports Aqaid, Akhlaq and other Islamic educational questions using approved sources. For a practical religious ruling, please consult a qualified scholar or an authorized religious office.',
    ur: 'اس مرحلے میں فقہی احکام اور مرجع سے متعلق فتاویٰ دستیاب نہیں ہیں۔ SJN فی الحال منظور شدہ مصادر کی مدد سے عقائد، اخلاق اور دیگر اسلامی تعلیمی سوالات میں معاونت کرتا ہے۔ عملی شرعی حکم کے لیے کسی اہل عالم یا مجاز دینی دفتر سے رجوع کریں۔',
    roman:
      'Is marhalay mein Fiqh aur Marja se mutaliq fatawa dastiyab nahin hain. SJN filhal manzoor shuda sources se Aqaid, Akhlaq aur doosray Islami taleemi sawalat mein madad karta hai. Amali sharai hukm ke liye kisi ahl aalim ya mujaz deeni daftar se rujoo karein.',
  },
  insufficient: {
    en: 'I could not verify a reliable answer in the available approved sources. A source title or relevant passage may help locate the evidence. I will not fill gaps in the sources with an unsupported answer.',
    ur: 'دستیاب منظور شدہ مصادر میں اس سوال کے معتبر جواب کی تصدیق نہیں ہو سکی۔ کسی مصدر کا عنوان یا متعلقہ عبارت شواہد تلاش کرنے میں مدد دے سکتی ہے۔ مصادر میں موجود خلا کو غیر مستند جواب سے پُر نہیں کیا جائے گا۔',
    roman:
      'Dastiyab manzoor shuda sources mein is sawal ke motabar jawab ki tasdeeq nahin ho saki. Kisi source ka unwan ya mutaliqa ibarat shawahid talash karne mein madad de sakti hai. Sources mein kami ko ghair mustanad jawab se poora nahin kiya jayega.',
  },
  clarify: {
    en: 'What subject, event, or passage does your question refer to? Please name it so I can search the approved sources.',
    ur: 'آپ کا سوال کس موضوع، واقعے یا عبارت سے متعلق ہے؟ براہِ کرم اس کا نام بتائیں تاکہ منظور شدہ مصادر میں تلاش کی جا سکے۔',
    roman:
      'Aap ka sawal kis mauzu, waqia ya ibarat se mutaliq hai? Barah-e-karam us ka naam batayein taake manzoor shuda sources mein talash ki ja sake.',
  },
  deceased: {
    en: 'Questions about commencing or continuing Taqlid of a deceased Marja require qualified religious guidance. Ayatollah Sayyid Ali Khamenei died in 2026; this application can reference approved published rulings, but does not decide your eligibility to follow a deceased authority. Please consult an authorized office or a qualified scholar.',
    ur: 'وفات یافتہ مرجع کی تقلید شروع کرنے یا جاری رکھنے کے سوال کے لیے اہل عالم کی رہنمائی ضروری ہے۔ آیت اللہ سید علی خامنہ ای کی وفات ۲۰۲۶ میں ہوئی۔ یہ ایپ منظور شدہ شائع شدہ احکام کا حوالہ دے سکتی ہے، لیکن تقلید کا فیصلہ نہیں کرتی۔ براہِ کرم مجاز دفتر یا اہل عالم سے رجوع کریں۔',
    roman:
      'Wafat yafta Marja ki taqleed shuru karne ya jari rakhne ke liye ahl aalim ki rehnumai zaroori hai. Ayatollah Sayyid Ali Khamenei ki wafat 2026 mein hui. Yeh app taqleed ka faisla nahin karti. Mujaz daftar ya ahl aalim se rujoo karein.',
  },
};
