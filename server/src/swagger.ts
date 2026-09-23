import swaggerJsdoc from 'swagger-jsdoc'
import { env } from './env.js'

export const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ticket Manager API',
      version: '0.0.0',
    },
    servers: [{ url: env.BETTER_AUTH_URL }],
  },
  // Scoped to avoid scanning the generated Prisma client; add new route files here.
  apis: ['./src/index.ts', './src/routes/**/*.ts'],
})
