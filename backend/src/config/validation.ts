import * as Joi from 'joi';

/**
 * Esquema de validacion de variables de entorno.
 * La app no arranca si faltan variables criticas.
 */
export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api'),
  CORS_ORIGIN: Joi.string().default('*'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_SYNCHRONIZE: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  JWT_SECRET: Joi.string().min(8).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),

  SSO_ISSUER_URL: Joi.string().allow('').default(''),
  SSO_SHARED_SECRET: Joi.string().allow('').default(''),

  SIESA_BASE_URL: Joi.string().allow('').default(''),
  SIESA_CONNI_KEY: Joi.string().allow('').default(''),
  SIESA_CONNI_TOKEN: Joi.string().allow('').default(''),
  SIESA_USERNAME: Joi.string().allow('').default(''),
  SIESA_PASSWORD: Joi.string().allow('').default(''),
  SIESA_COMPANY_ID: Joi.string().allow('').default(''),
  SIESA_TIMEOUT_MS: Joi.number().default(15000),

  PRICE_LISTS_BASE_URL: Joi.string()
    .allow('')
    .default('https://apiconsulta.grupo-santacruz.com'),
  PRICE_LISTS_TOKEN: Joi.string().allow('').default(''),
  PRICE_LISTS_TIMEOUT_MS: Joi.number().default(30000),
  ORDERS_UPLOAD_TIMEOUT_MS: Joi.number().default(60000),

  DISPATCH_TAT_INVOICES_URL: Joi.string().allow('').default(''),
  DISPATCH_TAT_INVOICES_URL_CARNES: Joi.string().allow('').default(''),
  DISPATCH_TAT_INVOICES_TOKEN: Joi.string().allow('').default(''),
  DISPATCH_API_TOKEN: Joi.string().allow('').default(''),
  DISPATCH_TIMEOUT_MS: Joi.number().default(30000),
});
