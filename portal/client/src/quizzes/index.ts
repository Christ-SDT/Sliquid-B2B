export type Quiz = {
  id: string
  title: string
  description: string
  /** Path to the SCORM index.html, relative to the portal origin */
  path: string
  passingScore: number
  estimatedMinutes: number
  thumbnail?: string
}

export const QUIZZES: Quiz[] = [
  {
    id: 'sliquiz',
    title: 'Customer Service Skills',
    description:
      'Master the essentials of customer service and product knowledge for Sliquid partners. Covers communication, product positioning, and retail best practices.',
    path: '/training/sliquiz/index.html',
    passingScore: 70,
    estimatedMinutes: 15,
  },
  // Add future quizzes here — each SCORM package goes in:
  // portal/client/public/training/<quiz-id>/index.html
]
