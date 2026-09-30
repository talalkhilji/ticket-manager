// Development data: 100 varied tickets so sorting, filtering and paging have something to show.
// Safe to re-run: it replaces the tickets it created before (their message ids end in @seed.example)
// and never touches other tickets. Requires at least one user (run `npm run seed` first).
import { prisma } from '../src/db.js'

type Category = 'general' | 'technical' | 'refund' | 'other'
type Status = 'open' | 'resolved' | 'closed'

// Small deterministic PRNG so every run produces the same tickets.
let seed = 20260930
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]

const people = [
  ['Sara Ahmed', 'sara.ahmed@gmail.com'],
  ['omar farouk', 'omar.farouk@outlook.com'],
  ['Layla Hassan', 'layla.h@yahoo.com'],
  ['Youssef Mansour', 'youssef.mansour@gmail.com'],
  ['Nour El-Din', 'nour.eldin@hotmail.com'],
  ['Mariam Khalil', 'mariam.khalil@gmail.com'],
  ['Ahmed Samir', 'ahmed.samir@company.org'],
  ['Hana Ibrahim', 'hana.ibrahim@gmail.com'],
  ['Karim Nabil', 'karim.nabil@outlook.com'],
  ['Dina Mostafa', 'dina.mostafa@gmail.com'],
  ['Tarek Adel', 'tarek.adel@proton.me'],
  ['Salma Reda', 'salma.reda@gmail.com'],
  ['Mohamed Gamal', 'm.gamal@university.edu'],
  ['Farida Osman', 'farida.osman@yahoo.com'],
  ['Ali Hossam', 'ali.hossam@gmail.com'],
  ['Rania Fouad', 'rania.fouad@outlook.com'],
  ['Hassan Younis', 'hassan.younis@gmail.com'],
  ['Yasmin Tawfik', 'yasmin.tawfik@icloud.com'],
  ['Mostafa Kamel', 'mostafa.kamel@gmail.com'],
  ['Aya Sherif', 'aya.sherif@hotmail.com'],
  ['Emily Carter', 'emily.carter@gmail.com'],
  ['Daniel Brooks', 'daniel.brooks@outlook.com'],
  ['Priya Nair', 'priya.nair@gmail.com'],
  ['Lucas Martin', 'lucas.martin@proton.me'],
  ['Sofia Rossi', 'sofia.rossi@yahoo.com'],
] as const

const courses = [
  'Python for Beginners',
  'Web Development Bootcamp',
  'Data Analysis with Excel',
  'UX Design Fundamentals',
  'Digital Marketing 101',
  'Machine Learning Basics',
  'Project Management Essentials',
  'Advanced SQL',
]

// Each template is [subject, body]. {course}, {n} and {amount} are filled in per ticket.
const templates: Record<Category, ReadonlyArray<readonly [string, string]>> = {
  general: [
    ['When does the next {course} cohort start?', 'Hello, I would like to enrol in {course} but I cannot find the next start date on the website. Could you tell me when it begins?'],
    ['Do you offer a certificate after {course}?', 'Hi, before I sign up for {course} I wanted to know whether I get an official certificate when I finish, and if employers recognise it.'],
    ['Question about course duration', 'How many hours per week should I expect to spend on {course}? I work full time and want to plan my schedule.'],
    ['Can I switch to a different course?', 'I enrolled in {course} yesterday but I think another course suits me better. Is it possible to switch, and how?'],
    ['Are there group discounts for teams?', 'Our company would like to enrol {n} employees. Do you have team plans or any bulk enrolment options?'],
    ['Do I need prior experience?', 'I have no background in this area. Is {course} suitable for complete beginners?'],
    ['Change my account email', 'I no longer use my old email address. How can I update the email on my account?'],
    ['Is there a mobile app?', 'I travel a lot and would like to follow lessons on my phone. Is there an app or is the website mobile friendly?'],
    ['Lifetime access to course material?', 'Do I keep access to the {course} videos after the course ends, or does access expire?'],
    ['Invoice for company reimbursement', 'My employer will reimburse {course}. Can you send me an invoice with the company name and VAT number?'],
  ],
  technical: [
    ['Cannot log in to my account', 'I keep getting "invalid credentials" even after resetting my password twice. I have tried Chrome and Firefox. Please help.'],
    ['Videos keep buffering in {course}', 'Lesson {n} of {course} stops every few seconds. My internet is fine, other sites work. Is there a problem on your side?'],
    ['Password reset email never arrives', 'I requested a password reset three times and nothing arrives, not even in spam. My email is correct.'],
    ['Quiz will not submit', 'When I click Submit on the quiz in module {n} nothing happens and the page just spins. I have lost my answers twice.'],
    ['Certificate download gives a 404 error', 'I completed {course} but the certificate link shows "404 Not Found". Could you fix it or send it to me directly?'],
    ['Code editor not loading in lessons', 'The in-browser code editor stays blank on my laptop. I am using Safari on macOS. It worked last week.'],
    ['Progress not saved', 'I finished lesson {n} but the course still shows 0% progress. I do not want to redo everything.'],
    ['Two-factor code not working', 'The verification code from my authenticator app is rejected every time. I got a new phone recently.'],
    ['Downloaded resources are corrupted', 'The PDF for module {n} of {course} will not open. It says the file is damaged. I tried downloading it three times.'],
    ['Site shows Arabic text as boxes', 'Parts of the interface display squares instead of Arabic letters on my Android phone.'],
  ],
  refund: [
    ['Refund request for {course}', 'I enrolled in {course} {n} days ago and it is not what I expected. I would like a refund of the {amount}.'],
    ['Charged twice for the same course', 'My bank statement shows two payments of {amount} for {course}. Please refund the duplicate charge.'],
    ['Cancel my subscription and refund', 'I want to cancel my monthly plan. I was billed {amount} this morning although I have not used the platform this month.'],
    ['Refund after course was cancelled', 'The live sessions of {course} were cancelled by the instructor. What happens with the {amount} I paid?'],
    ['Where is my refund?', 'You approved my refund of {amount} two weeks ago but I still have not received it. Please check the status.'],
    ['Accidental purchase', 'I bought {course} by mistake, my child pressed the button. I have not watched any lesson. Can I get my {amount} back?'],
    ['Wrong currency charged', 'I was charged {amount} in dollars instead of my local currency and the exchange fee was high. I would like this corrected.'],
    ['Refund to a different card', 'The card I used for {course} has expired. Can the refund of {amount} go to a new card?'],
  ],
  other: [
    ['Partnership opportunity', 'We run a training centre in Cairo and would like to discuss reselling your courses. Who should we speak to?'],
    ['Feedback about the instructor', 'I really enjoyed {course}. The instructor explained everything clearly. Thank you, please pass this on.'],
    ['Press enquiry', 'I am a journalist writing about online education. Could someone answer a few questions about your platform?'],
    ['Job application', 'I am a video editor and would love to work with your content team. Where can I send my portfolio?'],
    ['Suggestion for a new course', 'Please consider adding a course on cloud computing. Many of us would sign up immediately.'],
    ['Report inappropriate comment', 'A student posted an offensive comment in the {course} discussion. Please look into it.'],
    ['Delete my personal data', 'Please delete my account and all personal data stored about me, as allowed by data protection law.'],
    ['Unsubscribe from newsletters', 'I keep receiving marketing emails even after clicking unsubscribe. Please remove me from the list.'],
  ],
}

const agentReplies = [
  'Hi {first}, thanks for reaching out. I have looked into this and it is now sorted. Let us know if you need anything else.',
  'Hello {first}, thank you for your patience. This has been handled, please check and tell us if it still happens.',
  'Hi {first}, I have passed this to the right team and updated your account. Have a great day!',
]

const fill = (text: string, values: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]))

// Weighted so the list shows a realistic mix: mostly open, a fair share resolved, a few closed.
const statusPool: Status[] = [
  ...Array<Status>(52).fill('open'),
  ...Array<Status>(32).fill('resolved'),
  ...Array<Status>(16).fill('closed'),
]
const categoryPool: Array<Category | null> = [
  ...Array<Category>(28).fill('general'),
  ...Array<Category>(30).fill('technical'),
  ...Array<Category>(20).fill('refund'),
  ...Array<Category>(12).fill('other'),
  ...Array<null>(10).fill(null),
]

const users = await prisma.user.findMany({
  where: { deletedAt: null },
  select: { id: true },
  orderBy: { createdAt: 'asc' },
})
if (users.length === 0) throw new Error('No users found. Run `npm run seed` first.')

const removed = await prisma.ticket.deleteMany({
  where: { messages: { some: { messageId: { endsWith: '@seed.example>' } } } },
})

// Shuffle the pools so statuses and categories are not correlated.
const shuffle = <T>(items: T[]) => {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }
  return items
}
shuffle(statusPool)
shuffle(categoryPool)
// Uncategorised tickets are ones nobody has looked at yet, so move those onto open tickets.
for (let i = 0; i < 100; i++) {
  if (categoryPool[i] !== null || statusPool[i] === 'open') continue
  const j = categoryPool.findIndex((c, k) => c !== null && statusPool[k] === 'open')
  ;[categoryPool[i], categoryPool[j]] = [categoryPool[j], categoryPool[i]]
}

const now = Date.now()
const DAY = 24 * 60 * 60 * 1000
const created: Array<{ status: Status; category: Category | null; assigned: boolean }> = []

for (let i = 0; i < 100; i++) {
  const status = statusPool[i]
  const category = categoryPool[i]
  const [name, email] = pick(people)
  const [subjectTemplate, bodyTemplate] = category ? pick(templates[category]) : pick(templates.general)
  const values = {
    course: pick(courses),
    n: 2 + Math.floor(rand() * 28),
    amount: pick(['$49', '$99', '$149', '$199', '$29.99', 'EGP 1,500']),
    first: name.split(' ')[0],
  }

  // Spread over the last 60 days, with a bias towards recent ones; a few in the same minute to test ties.
  const age = i < 4 ? 0.5 * DAY : Math.pow(rand(), 1.6) * 60 * DAY
  const createdAt = new Date(now - age)
  const assigned = category !== null && status !== 'open' ? true : category !== null && rand() < 0.4
  const assigneeId = assigned ? pick(users).id : null

  const messages = [
    {
      direction: 'inbound' as const,
      senderType: 'customer' as const,
      fromEmail: email,
      body: fill(bodyTemplate, values),
      messageId: `<seed-${i + 1}-in@seed.example>`,
      createdAt,
    },
  ]
  if (status !== 'open') {
    messages.push({
      direction: 'outbound' as const,
      senderType: 'agent' as const,
      fromEmail: 'support@example.com',
      body: fill(pick(agentReplies), values),
      messageId: `<seed-${i + 1}-out@seed.example>`,
      createdAt: new Date(createdAt.getTime() + (1 + Math.floor(rand() * 20)) * 60 * 60 * 1000),
    })
  }

  await prisma.ticket.create({
    data: {
      subject: fill(subjectTemplate, values),
      senderName: name,
      senderEmail: email,
      status,
      category,
      assigneeId,
      createdAt,
      messages: { create: messages },
    },
  })
  created.push({ status, category, assigned })
}

const count = (fn: (t: (typeof created)[number]) => boolean) => created.filter(fn).length
console.log(`Removed ${removed.count} old seeded tickets, created ${created.length}.`)
console.log(
  `Status: open ${count((t) => t.status === 'open')}, resolved ${count((t) => t.status === 'resolved')}, closed ${count((t) => t.status === 'closed')}`,
)
console.log(
  `Category: general ${count((t) => t.category === 'general')}, technical ${count((t) => t.category === 'technical')}, refund ${count((t) => t.category === 'refund')}, other ${count((t) => t.category === 'other')}, none ${count((t) => t.category === null)}`,
)
console.log(`Assigned ${count((t) => t.assigned)}, unassigned ${count((t) => !t.assigned)}`)

await prisma.$disconnect()
