import { SESClient } from "@aws-sdk/client-ses";
import * as dotenv from 'dotenv';
import { env } from './env';

export const ses = new SESClient({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  },
});
