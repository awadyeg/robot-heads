import type { RobotHeadShape, RobotHeadState } from 'robot-heads';
import type { Activity, Bot, Folder, Message, Section, Task } from './types';

/* Sample data in the shape of the real office, so the GUI can be built and
   reviewed before it is linked to the bridge. Nothing here is real. */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => now - ms;

export const sections: Section[] = [
  { id: 'sara', name: 'Sara Engineering' },
  { id: 'software', name: 'Software' },
  { id: 'personal', name: 'Personal' },
  { id: 'branding', name: 'Branding' },
  { id: 'hobbies', name: 'Hobbies' },
];

export const folders: Folder[] = [
  { id: 'sara-projects', name: 'Sara Eng Projects', count: 39 },
  { id: 'unassigned', name: 'Unassigned', count: 7 },
];

interface Seed {
  name: string;
  section: string | null;
  color: string;
  shape?: RobotHeadShape;
  screen?: string;
  state?: RobotHeadState;
  activity?: string;
  last: string;
  at: number;
  unread?: number;
  tag?: string;
  lead?: boolean;
  doing?: string[];
  next?: string[];
  done?: string[];
  tools?: Array<[string, string]>;
}

const seeds: Seed[] = [
  {
    name: 'General Manager', section: null, lead: true, color: '#e9e9ee', screen: '#7fe7ff', shape: 'circle',
    state: 'thinking', activity: 'Planning the week across all teams', last: 'Weekly plan is ready for review', at: ago(25 * MIN),
    doing: ['Weekly plan for all teams'], next: ['Follow up with Sara Eng Team on overdue items', 'Send FYI digest to Personal bots'],
    done: ['Sent FYI to Nutritionist, PMP Instructor and Personal Branding Training', 'Reviewed Invoicing advance payments'],
    tools: [['session_search', 'last 7 days across bots'], ['todo', 'weekly plan']],
  },
  {
    name: 'Sara Eng Team', section: null, lead: true, color: '#1f2c5c', shape: 'square',
    state: 'working', activity: 'Collecting status from 9 team bots', last: '3 bots reported in, 6 to go', at: ago(12 * MIN), unread: 2,
    doing: ['Daily stand-up summary'], next: ['Chase Document Controller for the missing attachment'],
    done: ['Asked Technical Expert to re-check the lighting unit numbers'],
    tools: [['send_message', 'Technical Expert'], ['send_message', 'Drawings'], ['read_file', 'team-status.md']],
  },

  // Sara Engineering
  {
    name: 'Technical Expert', section: 'sara', color: '#1fd17a', shape: 'hexagon', state: 'searching',
    activity: 'web_search · lighting unit datasheet', last: 'الأرقام اللي إنت فاكرها صح، بس دي بتاعة وحدة الإضاءة المت…', at: ago(2 * DAY),
    doing: ['مراجعة أرقام وحدة الإضاءة'], next: ['مقارنة البدائل المتاحة في السوق'], done: ['حساب الأحمال للدور الأرضي'],
    tools: [['web_search', 'lighting unit datasheet'], ['web_extract', 'manufacturer PDF']],
  },
  {
    name: 'Invoicing', section: 'sara', color: '#ff2f92', shape: 'circle', state: 'working',
    activity: 'Preparing advance payment invoice', last: 'دفعة مقدّم', at: ago(3 * DAY), unread: 1,
    doing: ['فاتورة الدفعة المقدمة'], next: ['متابعة التحصيل مع العميل', 'تحديث شيت المدفوعات'], done: ['استلام طلب الدفعة من Email'],
    tools: [['read_file', 'invoices/2026-10.xlsx'], ['write_file', 'advance-invoice.pdf']],
  },
  {
    name: 'Email', section: 'sara', color: '#13c2b0', shape: 'rectangle', state: 'idle',
    activity: '', last: 'Messaged Invoicing: Advance payment chas…', at: ago(3 * DAY),
    next: ['Daily inbox sweep at 9:00'], done: ['Forwarded advance payment request to Invoicing', 'Archived 42 newsletters'],
  },
  {
    name: 'Whatsapp Projects Tracker', section: 'sara', color: '#25d366', screen: '#7dff9a', shape: 'circle', state: 'searching',
    activity: 'Scanning project groups for new updates', last: 'Messaged Nobu Hotel Project: FYI, new in W…', at: ago(3 * DAY),
    doing: ['Scan project groups'], next: ['Send digest to Sara Eng Team'], done: ['Sent FYI to Nobu Hotel Project'],
    tools: [['whatsapp_read', 'Nobu Hotel group'], ['whatsapp_read', 'Site team group']],
  },
  {
    name: 'Drawings', section: 'sara', color: '#1f6fff', shape: 'circle', state: 'idle',
    activity: '', last: 'عشان الإطار يفضل زي ما هو بالظبط، بما فيه اللوجو، أنسب ط…', at: ago(4 * DAY),
    next: ['تحديث إطار اللوحات باللوجو الجديد'], done: ['تجهيز قالب الإطار'],
  },
  {
    name: 'Recruiter', section: 'sara', color: '#ff9500', shape: 'hexagon', state: 'idle',
    activity: '', last: 'بعت لبوت الواتساب يبعت لمصطفي "السلام عليكم" بس، على …', at: ago(4 * DAY),
    done: ['تواصل مع مصطفى عن طريق بوت الواتساب'], next: ['فرز السير الذاتية الجديدة'],
  },
  {
    name: 'Document Controller', section: 'sara', color: '#f2c200', shape: 'square', state: 'listening',
    activity: 'Waiting for you: which revision is final?', last: 'Attachment', at: ago(5 * DAY), unread: 1,
    doing: ['Archive revision C drawings'], next: ['Update the transmittal log'], done: ['Received the attachment'],
  },
  {
    name: 'Graphics', section: 'sara', color: '#ff2d2d', shape: 'circle', state: 'idle',
    activity: '', last: 'الخريطة شغّالة، و', at: ago(7 * DAY), done: ['الخريطة التفاعلية'],
  },
  {
    name: 'Marketing', section: 'sara', color: '#9c6b3f', shape: 'rectangle', state: 'sleeping',
    activity: '', last: 'راجعت فيديو الـ ٣٠ ثانية كويس — الإعلان شكله كوربوريت …', at: ago(12 * DAY),
    done: ['مراجعة فيديو الإعلان ٣٠ ثانية'],
  },

  // Software
  {
    name: 'Home Assistant Developer', section: 'software', color: '#12c96a', shape: 'circle', state: 'idle',
    activity: '', last: 'التوكن موجود في ملف خاص على جوجل درايف بتاعك، في أ…', at: ago(1 * DAY),
    next: ['ربط حساسات الحركة بالأتمتة'], done: ['إيجاد مكان التوكن'],
  },
  {
    name: 'ESP32 Developer', section: 'software', color: '#ff2f92', shape: 'circle', state: 'idle',
    activity: '', last: 'أسهل طريقة إنك تكلم مشروع Cursor مباشرة من اللينك ده، …', at: ago(1 * DAY),
    done: ['شرح طريقة الربط مع Cursor'],
  },
  {
    name: 'Software Team Leader', section: 'software', color: '#ff2d3a', shape: 'hexagon', state: 'working',
    activity: 'terminal · deploying usage dashboard', last: 'كان كفا… Claude بتاع usage اتنزّل على السيرفر. الـ gstack', at: ago(1 * DAY), unread: 3,
    doing: ['نشر لوحة الاستخدام على السيرفر'], next: ['مراجعة PRs المفتوحة', 'تقرير أسبوعي للفريق'],
    done: ['تنزيل Claude usage على السيرفر', 'إعداد gstack'],
    tools: [['terminal', 'docker compose up -d'], ['terminal', 'curl /health'], ['read_file', 'deploy.log']],
  },
  {
    name: 'Mobile App Developer', section: 'software', color: '#ff2f92', shape: 'square', state: 'working',
    activity: 'terminal · ./gradlew assembleRelease', last: 'اتشالت الجملة من صفحة الإعدادات، والنسخة الجديدة متنزّلة…', at: ago(2 * DAY),
    doing: ['بناء النسخة 2.2 من التطبيق'], next: ['واجهة المكتب الجديدة للبوتات', 'اختبار الإشعارات'],
    done: ['حذف الجملة من صفحة الإعدادات', 'رفع النسخة 2.1'],
    tools: [['terminal', './gradlew assembleRelease'], ['patch', 'MainActivity.java']],
  },
  {
    name: 'AwadyPM2', section: 'software', color: '#8b4dff', shape: 'square', state: 'idle',
    activity: '', last: 'لقيت أسامي جديدة قصيرة بطابع مصري وعربي، ومن غير …', at: ago(2 * DAY),
    next: ['تسجيل الدومين للاسم المختار'], done: ['قائمة أسماء مقترحة'],
  },
  {
    name: 'VDrive', section: 'software', color: '#7a7a80', shape: 'rectangle', state: 'happy',
    activity: 'Shipped the new design', last: '✅ التصميم الجديد نزل على الموقع اللايف', at: ago(5 * DAY),
    done: ['نشر التصميم الجديد على الموقع'],
  },
  {
    name: 'Flosyfeen', section: 'software', color: '#ff2f92', shape: 'hexagon', state: 'idle',
    activity: '', last: 'اتضافت فئة Career development في الـ API والواجهة، …', at: ago(7 * DAY),
    done: ['إضافة فئة Career development'],
  },
  {
    name: 'BuildingAI3', section: 'software', color: '#1f6fff', shape: 'square', state: 'idle',
    activity: '', last: 'مش كله تعديل شكل. فيه أفكار بتضيف وظائف جديدة، وفيه …', at: ago(7 * DAY),
    next: ['ترتيب الأفكار حسب الأولوية'],
  },
  {
    name: 'Darwish Store', section: 'software', color: '#12c96a', shape: 'circle', state: 'idle',
    activity: '', last: 'الاختبارات شغالة على جهازك بأمر npm test، وهو اللي في ال…', at: ago(8 * DAY),
    done: ['تشغيل الاختبارات'],
  },

  // Personal
  {
    name: 'Doctor', section: 'personal', color: '#13c2b0', shape: 'circle', state: 'idle',
    activity: '', last: 'شرح نتيجة التحليل', at: ago(1 * DAY), done: ['قراءة نتيجة التحليل'],
  },
  {
    name: 'Money Tracker', section: 'personal', color: '#f4f4f4', screen: '#7dff9a', shape: 'circle', state: 'thinking',
    activity: 'Waiting on Google messages access', last: 'لسه رسايل جوجل مقفولة على الكمبيوتر عندي، فوقفت فحص…', at: ago(1 * DAY),
    doing: ['مراجعة مصاريف الشهر'], next: ['فحص رسايل البنك بعد فتح جوجل'], done: ['تصنيف اشتراك جديد كمصروف شغل'],
  },
  {
    name: 'مسلسلات وافلام', section: 'personal', color: '#1f6fff', shape: 'circle', state: 'idle',
    activity: '', last: 'اتأكدت من نهاية بابا وماما جيران، والصورة طلعت مش مظبو…', at: ago(1 * DAY),
  },
  {
    name: "Menna's Doctor", section: 'personal', color: '#12c96a', shape: 'circle', state: 'idle',
    activity: '', last: 'آخر تذكير الليلة 💊', at: ago(2 * DAY), next: ['تذكير الساعة 9 مساءً'],
  },
  {
    name: 'Freelancer', section: 'personal', color: '#13c2b0', shape: 'circle', state: 'listening',
    activity: 'Waiting for you: سجّل دخولك على Facebook', last: 'Waiting for you: سجّل دخولك على Facebook وعلّم…', at: ago(3 * DAY), unread: 1,
    doing: ['نشر العرض على جروبات الفريلانس'], next: ['متابعة الردود'], done: ['كتابة نص العرض'],
  },
  {
    name: 'Family & Friends', section: 'personal', color: '#ff2f92', shape: 'circle', state: 'idle',
    activity: '', last: 'فيه ناس مستنية ردك على الواتساب، أهمهم ماما…', at: ago(4 * DAY), unread: 2,
  },
  {
    name: 'Subscriptions tracker', tag: 'Subscriptions', section: 'personal', color: '#1f6fff', shape: 'rectangle', state: 'idle',
    activity: '', last: 'بلغت Money Tracker إن الاشتراك ده شغل، وطلبت منه مبل…', at: ago(5 * DAY),
  },
  {
    name: 'Nutritionist', section: 'personal', color: '#12c96a', shape: 'circle', state: 'sleeping',
    activity: '', last: 'Message from General Manager: FYI from M…', at: ago(13 * DAY),
  },

  // Branding
  {
    name: 'Courses', section: 'branding', color: '#1f6fff', shape: 'circle', state: 'idle',
    activity: '', last: 'لقيت اختيارات أضمن بكتير من الجامعة الفرنسية. أفضل حاج…', at: ago(2 * DAY),
  },
  {
    name: 'Linkedin Master', section: 'branding', color: '#1f6fff', shape: 'square', state: 'searching',
    activity: 'browser · scanning today\'s feed', last: 'لقيت ٣ بوستات جديدة النهارده، وكتبتلك تعليق قصير لكل وا…', at: ago(3 * DAY),
    doing: ['البحث عن بوستات جديدة'], next: ['كتابة تعليقات قصيرة'], done: ['٣ تعليقات جاهزة للمراجعة'],
    tools: [['browser_navigate', 'linkedin.com/feed'], ['browser_snapshot', 'feed']],
  },
  {
    name: 'Sales', section: 'branding', color: '#ff2f92', shape: 'hexagon', state: 'idle',
    activity: '', last: 'لو تحب، أعمل بحث أسبوعي ثابت يجيبلك العملاء الجداد بس…', at: ago(5 * DAY),
  },
  {
    name: 'Networking', section: 'branding', color: '#ff2d3a', shape: 'circle', state: 'idle',
    activity: '', last: 'المطلوبين الأربعة كلهم محجوزين:', at: ago(10 * DAY),
  },
  {
    name: 'PMP Instructor', section: 'branding', color: '#ff6a00', shape: 'square', state: 'sleeping',
    activity: '', last: 'Message from General Manager: FYI from M…', at: ago(13 * DAY),
  },
  {
    name: 'Personal Branding Training', section: 'branding', color: '#13c2b0', shape: 'hexagon', state: 'sleeping',
    activity: '', last: 'Message from General Manager: FYI from M…', at: ago(13 * DAY),
  },

  // Hobbies
  {
    name: 'Video Editor', section: 'hobbies', color: '#ff2d3a', shape: 'circle', state: 'idle',
    activity: '', last: 'الإجابة الصريحة: أقرب حاجة أوصل لها هي حاجة قريبة من ال…', at: ago(2 * DAY),
  },
  {
    name: 'Piano Teacher', tag: 'Piano Teacher', section: 'hobbies', color: '#1a2547', screen: '#ffffff', shape: 'rectangle', state: 'idle',
    activity: '', last: 'ولو عايز أرخص، دول مصريين برضه بس مافيش ريفيوهات أ…', at: ago(4 * DAY),
  },
];

let uid = 0;
const id = (p: string) => `${p}${++uid}`;

function slug(name: string, i: number) {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return s || `bot-${i}`;
}

function buildTasks(s: Seed): Task[] {
  return [
    ...(s.doing ?? []).map((title) => ({ id: id('t'), title, status: 'doing' as const })),
    ...(s.next ?? []).map((title) => ({ id: id('t'), title, status: 'next' as const })),
    ...(s.done ?? []).map((title, i) => ({ id: id('t'), title, status: 'done' as const, at: s.at - (i + 1) * 47 * MIN })),
  ];
}

function buildLog(s: Seed): Activity[] {
  const log: Activity[] = [];
  let t = s.at - 3 * HOUR;
  for (const title of s.done ?? []) log.push({ id: id('a'), at: (t += 20 * MIN), kind: 'task', text: `Finished: ${title}` });
  for (const [tool, text] of s.tools ?? []) log.push({ id: id('a'), at: (t += 6 * MIN), kind: 'tool', tool, text });
  log.push({ id: id('a'), at: s.at, kind: 'message', text: s.last });
  if (s.state === 'listening') log.push({ id: id('a'), at: s.at + MIN, kind: 'waiting', text: s.activity ?? 'Waiting for you' });
  return log;
}

function buildChat(s: Seed): Message[] {
  const peer = s.last.startsWith('Message from ');
  return [
    { id: id('m'), role: 'user', text: 'إيه الأخبار؟ قولي وصلت لفين.', at: s.at - 40 * MIN },
    peer
      ? { id: id('m'), role: 'peer', from: 'General Manager', text: s.last.replace(/^Message from General Manager: /, ''), at: s.at }
      : { id: id('m'), role: 'bot', text: s.last, at: s.at },
  ];
}

export function seedBots(): Bot[] {
  return seeds.map((s, i) => ({
    id: slug(s.name, i),
    name: s.name,
    tag: s.tag,
    sectionId: s.section,
    lead: s.lead,
    color: s.color,
    screenColor: s.screen,
    shape: s.shape ?? 'circle',
    state: s.state ?? 'idle',
    activity: s.activity ?? '',
    lastMessage: s.last,
    lastAt: s.at,
    unread: s.unread ?? 0,
    tasks: buildTasks(s),
    log: buildLog(s),
    chat: buildChat(s),
  }));
}
