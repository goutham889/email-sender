import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { google } from 'googleapis';
import axios from 'axios';

declare module 'express-session' {
  interface SessionData {
    googleTokens: any;
    linkedinTokens: any;
  }
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'auto-reach-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: true,
    sameSite: 'none',
    httpOnly: true,
  }
}));

app.get('/privacy', (req, res) => {
  res.send('<h1>Privacy Policy</h1><p>This app only accesses your Google Sheets and Gmail to perform outreach as requested by you. Your data is not stored permanently on our servers.</p>');
});

app.get('/terms', (req, res) => {
  res.send('<h1>Terms of Service</h1><p>By using AutoReach, you agree to use the automation responsibly and comply with Google and LinkedIn policies.</p>');
});

// Google OAuth Setup
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.warn('WARNING: GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing in environment variables.');
}

const APP_URL = process.env.APP_URL?.replace(/\/$/, '') || '';

const googleOAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${APP_URL}/auth/google/callback`
);

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email'
];

// LinkedIn OAuth Setup
const LINKEDIN_CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const LINKEDIN_CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const LINKEDIN_REDIRECT_URI = `${APP_URL}/auth/linkedin/callback`;

// Routes
app.get('/api/auth/google/url', (req, res) => {
  const url = googleOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent select_account'
  });
  res.json({ url });
});

app.post('/api/auth/google/logout', (req, res) => {
  (req.session as any).googleTokens = null;
  res.json({ success: true });
});

app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const { tokens } = await googleOAuth2Client.getToken(code as string);
    (req.session as any).googleTokens = tokens;
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'google' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/auth/linkedin/url', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: LINKEDIN_CLIENT_ID!,
    redirect_uri: LINKEDIN_REDIRECT_URI,
    scope: 'r_liteprofile r_emailaddress w_member_social', // Basic scopes
  });
  const url = `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  res.json({ url });
});

app.get('/auth/linkedin/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const response = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({
      grant_type: 'authorization_code',
      code: code as string,
      client_id: LINKEDIN_CLIENT_ID!,
      client_secret: LINKEDIN_CLIENT_SECRET!,
      redirect_uri: LINKEDIN_REDIRECT_URI,
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    (req.session as any).linkedinTokens = response.data;
    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', provider: 'linkedin' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. This window should close automatically.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('LinkedIn Auth Error:', error);
    res.status(500).send('Authentication failed');
  }
});

app.get('/api/user/status', (req, res) => {
  res.json({
    googleConnected: !!(req.session as any).googleTokens,
    linkedinConnected: !!(req.session as any).linkedinTokens,
    configSet: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    redirectUri: `${APP_URL}/auth/google/callback`
  });
});

// Sheet Data Fetching
app.get('/api/sheets/data', async (req, res) => {
  const tokens = (req.session as any).googleTokens;
  if (!tokens) return res.status(401).json({ error: 'Not connected to Google' });

  const sheetId = req.query.sheetId as string;
  const range = req.query.range as string || 'A1:Z100'; // Default to first sheet

  googleOAuth2Client.setCredentials(tokens);
  const sheets = google.sheets({ version: 'v4', auth: googleOAuth2Client });

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: range,
    });
    res.json({ values: response.data.values });
  } catch (error) {
    console.error('Sheets Error:', error);
    res.status(500).json({ error: 'Failed to fetch sheet data' });
  }
});

// Email Sending
app.post('/api/send/email', async (req, res) => {
  const tokens = (req.session as any).googleTokens;
  if (!tokens) return res.status(401).json({ error: 'Not connected to Google' });

  const { to, subject, body } = req.body;

  googleOAuth2Client.setCredentials(tokens);
  const gmail = google.gmail({ version: 'v1', auth: googleOAuth2Client });

  const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
  const messageParts = [
    `From: me`,
    `To: ${to}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    `Subject: ${utf8Subject}`,
    '',
    body,
  ];
  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Gmail Error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// LinkedIn Posting (Messaging is restricted, so we implement posting as a fallback/demo)
app.post('/api/send/linkedin', async (req, res) => {
  const tokens = (req.session as any).linkedinTokens;
  if (!tokens) return res.status(401).json({ error: 'Not connected to LinkedIn' });

  const { text } = req.body;

  try {
    // First get user URN
    const profileResponse = await axios.get('https://api.linkedin.com/v2/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const userUrn = `urn:li:person:${profileResponse.data.id}`;

    // Post to feed
    await axios.post('https://api.linkedin.com/v2/ugcPosts', {
      author: userUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE'
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    }, {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('LinkedIn API Error:', error);
    res.status(500).json({ error: 'Failed to post to LinkedIn' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
