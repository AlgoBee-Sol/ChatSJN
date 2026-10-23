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
  classify(question: string): Topic {
    const q = normalize(question);
    if (
      /\b(pray|prayer|prayers|namaz|salah|salaat|wudu|wudhu|wuzu|ablution|fast|fasting|roza|rozay|khums|zakat|halal|haram|permissible|allowed|ruling|fatwa|taqlid|taqleed|ghusl|nikah|divorce|inheritance|najis|taharat|hajj)\b|نماز|وضو|روزہ|روزے|خمس|زکات|حلال|حرام|جائز|حکم|تقلید|غسل|نکاح|طلاق|نجس/.test(
        q,
      )
    )
      return 'FIQH';
    if (/quran|qur'an|tafsir|surah|ayat|قرآن|تفسیر|سورہ|آیت/.test(q)) return 'QURAN';
    if (/hadith|hadees|حدیث/.test(q)) return 'HADITH';
    if (/akhlaq|kindness|patience|sabr|honesty|gratitude|اخلاق|صبر|شکر/.test(q)) return 'AKHLAQ';
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
      topics: category,
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
  insufficient: {
    en: 'I do not have enough relevant, approved source material to answer this reliably. Please consult the authorized office of your Marja or a qualified scholar. I will not infer a religious ruling from incomplete evidence.',
    ur: 'اس سوال کا معتبر جواب دینے کے لیے منظور شدہ متعلقہ مصادر کافی نہیں ہیں۔ براہِ کرم اپنے مرجع کے مجاز دفتر یا کسی اہل عالم سے رجوع کریں۔ نامکمل شواہد سے شرعی حکم اخذ نہیں کیا جائے گا۔',
    roman:
      'Is sawal ka mo’tabar jawab dene ke liye manzoor shuda mutaliqa sources kaafi nahin hain. Apne Marja ke mujaz daftar ya kisi ahl aalim se rujoo karein. Na-mukammal shawahid se sharai hukm akhaz nahin kiya jayega.',
  },
  clarify: {
    en: 'Could you clarify the Islamic topic and the specific question you would like to explore? For example, is this about a practical religious ruling, beliefs, Quran, history, or ethics?',
    ur: 'براہِ کرم اسلامی موضوع اور اپنا مخصوص سوال واضح کریں۔ کیا آپ شرعی حکم، عقائد، قرآن، تاریخ یا اخلاق کے بارے میں پوچھ رہے ہیں؟',
    roman:
      'Barah-e-karam Islami mauzu aur apna khaas sawal wazeh karein. Kya aap sharai hukm, aqaid, Quran, tareekh ya akhlaq ke bare mein pooch rahe hain?',
  },
  deceased: {
    en: 'Questions about commencing or continuing Taqlid of a deceased Marja require qualified religious guidance. Ayatollah Sayyid Ali Khamenei died in 2026; this application can reference approved published rulings, but does not decide your eligibility to follow a deceased authority. Please consult an authorized office or a qualified scholar.',
    ur: 'وفات یافتہ مرجع کی تقلید شروع کرنے یا جاری رکھنے کے سوال کے لیے اہل عالم کی رہنمائی ضروری ہے۔ آیت اللہ سید علی خامنہ ای کی وفات ۲۰۲۶ میں ہوئی۔ یہ ایپ منظور شدہ شائع شدہ احکام کا حوالہ دے سکتی ہے، لیکن تقلید کا فیصلہ نہیں کرتی۔ براہِ کرم مجاز دفتر یا اہل عالم سے رجوع کریں۔',
    roman:
      'Wafat yafta Marja ki taqleed shuru karne ya jari rakhne ke liye ahl aalim ki rehnumai zaroori hai. Ayatollah Sayyid Ali Khamenei ki wafat 2026 mein hui. Yeh app taqleed ka faisla nahin karti. Mujaz daftar ya ahl aalim se rujoo karein.',
  },
};
