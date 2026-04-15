import { google } from "googleapis";

export default async function handler(req, res) {
  try {
    const { sheetId, range, tokens } = req.query;

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    client.setCredentials(JSON.parse(tokens));

    const sheets = google.sheets({ version: "v4", auth: client });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range || "A1:Z100",
    });

    res.json({ values: response.data.values });

  } catch (err) {
    res.status(500).json({ error: "Sheets fetch failed" });
  }
}