// NOTE: The `trainings` DB table is now the source of truth for quizzes (migration v11).
// QuizPage and TrainingsPage both fetch from GET /api/trainings.
// This file is kept for reference only — do not import QUIZZES in new code.

export type Quiz = {
  id: string
  title: string
  description: string
  /** Path to the SCORM index.html, relative to the portal origin */
  path: string
  passingScore: number
  estimatedMinutes: number
  thumbnail?: string
  /**
   * Optional video to show before the SCORM quiz loads.
   * Can be a relative public path (/training/…) or an absolute URL (CDN/Vimeo/etc).
   * When set, QuizPage shows a video player phase first with a Skip button.
   */
  videoPath?: string
}

export const QUIZZES: Quiz[] = [
  {
    id: 'h2o-vs-sassy',
    title: 'H2O vs Sassy',
    description:
      'Discover the differences between H2O and Sassy product lines — formulations, ingredients, and how to match customers to the right product.',
    path: '/training/h2o-vs-sassy/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
    videoPath: 'https://youtu.be/r9ttBy_WlfA',
  },
  {
    id: 'sea-vs-tsunami',
    title: 'Sea vs Tsunami',
    description:
      'Learn the differences between Sea and Tsunami product lines — formulations, positioning, and how to guide customers to the right choice.',
    path: '/training/sea-vs-tsunami/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
    videoPath: 'https://youtu.be/lFVvtQfOb8Y',
  },
  {
    id: 'sizzle-vs-sparks',
    title: 'Sizzle vs Sparks',
    description:
      'Discover the differences between Sizzle and Sparks product lines — formulations, sensations, and how to guide customers to the right choice.',
    path: '/training/sizzle-vs-sparks/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
    videoPath: 'https://youtu.be/yt3FzssdPh0',
  },
  {
    id: 'splash',
    title: 'Sliquid Splash',
    description:
      'Learn about Sliquid Splash — a gentle feminine wash formulated to cleanse and balance with natural ingredients.',
    path: '/training/splash/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
    videoPath: 'https://youtu.be/6SHy8fWy3r8',
  },
  {
    id: 'soul',
    title: 'Sliquid Soul',
    description:
      'Explore Sliquid Soul — a rich, creamy body lotion crafted to deeply moisturize and nourish with clean, body-safe ingredients.',
    path: '/training/soul/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
    videoPath: 'https://youtu.be/PdsWwZDBOmw',
  },
  {
    id: 'soak',
    title: 'Sliquid Soak',
    description:
      'Learn about Sliquid Soak — a gentle toy cleaner and body cleanser made to safely care for intimacy products and skin.',
    path: '/training/soak/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
    videoPath: 'https://youtu.be/Zwnm6h5YekM',
  },
  {
    id: 'soothe',
    title: 'Sliquid Soothe',
    description:
      'Discover Sliquid Soothe — a calming, aloe-based aftercare lotion designed to hydrate and soothe sensitive skin post-intimacy.',
    path: '/training/soothe/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
    videoPath: 'https://youtu.be/hhfTxbiYsBI',
  },
  // Add future quizzes here — each SCORM package goes in:
  // portal/client/public/training/<quiz-id>/index.html
]
