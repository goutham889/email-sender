import { google } from "googleapis";

export default async function handler(req, res) {
  const { code } = req.query;

  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/google-callback`
  );

  const { tokens } = await client.getToken(code as string);

  return res.json({ tokens });
}