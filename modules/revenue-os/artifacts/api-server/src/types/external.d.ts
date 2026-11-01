declare module "resend";
declare module "form-data";
declare module "mailgun.js";
declare module "nodemailer";
declare module "firebase-admin";
declare module "web-push";
declare module "pg";

interface PushSubscriptionJSON {
  endpoint: string;
  expirationTime: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
}
