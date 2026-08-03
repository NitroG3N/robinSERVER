const { PrismaClient } = require('@prisma/client')

// Keep one client during nodemon reloads; Prisma manages the Postgres connection pool.
const prisma = global.prisma || new PrismaClient()

if (process.env.NODE_ENV !== 'production') global.prisma = prisma

module.exports = prisma
