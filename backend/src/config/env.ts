import dotenv from 'dotenv';
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

// Fail fast in production if critical env vars are missing
if (NODE_ENV === 'production') {
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'JWT_SECRET',
    'SUPABASE_ANON_KEY',
  ];
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
  // Never allow the default dev secret in production
  if (process.env.JWT_SECRET === 'dev-secret-change-in-production') {
    throw new Error('JWT_SECRET must be changed in production!');
  }
}

export const env = {
  // Server
  PORT: parseInt(process.env.PORT || '3000'),
  NODE_ENV,

  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',

  // SaaS
  DEFAULT_PLAN: process.env.DEFAULT_PLAN || 'basic',
  TRIAL_PERIOD_DAYS: parseInt(process.env.TRIAL_PERIOD_DAYS || '14'),

  // Browser push notifications
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:support@kautix.in',



  // AWS SES
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || '',
  SES_FROM_EMAIL: process.env.SES_FROM_EMAIL || 'noreply@kautix.in',

  // AWS S3
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME || 'kautix',
  AWS_S3_PUBLIC_URL: process.env.AWS_S3_PUBLIC_URL || `https://${process.env.AWS_BUCKET_NAME || 'kautix'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com`,

  // Email delivery. Keep SES configured for later production activation.
  // Supported values: resend, ses, hold.
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER || 'resend',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  RESEND_FROM: process.env.RESEND_FROM || 'Kautix <noreply@kautix.in>',

  // OpenAI / OpenRouter
  OPENAI_API_KEY: process.env.openrouter_api || process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.model_name ?
    (process.env.model_name === 'GPT-4o mini' ? 'openai/gpt-4o-mini' : process.env.model_name) :
    'openai/gpt-3.5-turbo',
  OPENAI_BASE_URL: process.env.openrouter_api ? 'https://openrouter.ai/api/v1' : undefined,

  // Multilingual
  AVAILABLE_LANGUAGES: (process.env.AVAILABLE_LANGUAGES || 'en').split(','),
  DEFAULT_LANGUAGE: process.env.DEFAULT_LANGUAGE || 'en',
};
