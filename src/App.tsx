import { useState, useEffect } from 'react';
import { 
  Mail, FileSpreadsheet, Send, CheckCircle2, AlertCircle, 
  Settings, Play, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';

export default function App() {
  const [tokens, setTokens] = useState<any>(null);

  const [sheetId, setSheetId] = useState('');
  const [sheetData, setSheetData] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);

  const [emailTemplate, setEmailTemplate] = useState('Hi {{Name}},\n\nI saw your profile and would love to connect!');
  const [subjectTemplate, setSubjectTemplate] = useState('Connecting with {{Name}}');
  const [linkedinTemplate, setLinkedinTemplate] = useState('Hi {{Name}}, I would love to connect!');

  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedMessages, setGeneratedMessages] = useState<{ name: string, message: string }[]>([]);

  // Load tokens
  useEffect(() => {
    const stored = localStorage.getItem("google_tokens");
    if (stored) setTokens(JSON.parse(stored));
  }, []);

  // Handle OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (code && !tokens) {
      fetch(`/api/google-callback?code=${code}`)
        .then(res => res.json())
        .then(data => {
          localStorage.setItem("google_tokens", JSON.stringify(data.tokens));
          setTokens(data.tokens);
          window.history.replaceState({}, document.title, "/");
          toast.success("Google connected!");
        });
    }
  }, []);

  // Connect Google
  const connectGoogle = async () => {
    try {
      const res = await fetch(`/api/google-url`);
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      toast.error("Failed to connect Google");
    }
  };

  // Extract sheet ID
  const extractSheetId = (input: string) => {
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    return input.trim();
  };

  // Fetch Sheet Data
  const fetchSheetData = async () => {
    if (!tokens) return toast.error("Connect Google first");

    const id = extractSheetId(sheetId);
    if (!id) return toast.error("Invalid Sheet ID");

    setLoading(true);
    try {
      const res = await fetch(`/api/sheets-data?sheetId=${id}&tokens=${encodeURIComponent(JSON.stringify(tokens))}`);
      const data = await res.json();

      if (data.error) throw new Error(data.error);

      setSheetData(data.values || []);
      toast.success("Sheet loaded");
    } catch {
      toast.error("Failed to fetch sheet");
    } finally {
      setLoading(false);
    }
  };

  // Replace variables
  const replaceVariables = (template: string, row: string[], headers: string[]) => {
    let result = template;
    headers.forEach((header, i) => {
      result = result.replace(new RegExp(`{{${header}}}`, 'g'), row[i] || '');
    });
    return result;
  };

  // Run automation
  const runAutomation = async (type: 'email' | 'linkedin' | 'combined') => {
    if (sheetData.length < 2) return toast.error("No data");

    setIsProcessing(true);

    const headers = sheetData[0];
    const rows = sheetData.slice(1);

    const emailIndex = headers.findIndex(h => h.toLowerCase().includes("email"));
    const nameIndex = headers.findIndex(h => h.toLowerCase().includes("name"));

    let success = 0;
    const generated: any[] = [];

    for (const row of rows) {
      try {
        if ((type === 'email' || type === 'combined') && emailIndex !== -1) {
          const to = row[emailIndex];
          if (to) {
            const subject = replaceVariables(subjectTemplate, row, headers);
            const body = replaceVariables(emailTemplate, row, headers);

            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to, subject, body, tokens })
            });

            success++;
          }
        }

        if (type === 'linkedin' || type === 'combined') {
          const name = row[nameIndex] || "Lead";
          const message = replaceVariables(linkedinTemplate, row, headers);
          generated.push({ name, message });
        }

      } catch {
        console.error("Failed row");
      }
    }

    setGeneratedMessages(generated);
    setIsProcessing(false);

    toast.success(`Done! Emails: ${success}, Messages: ${generated.length}`);
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <div className="p-6">
      <Toaster />

      <h1 className="text-2xl font-bold mb-4">Email Sender 🚀</h1>

      {!tokens ? (
        <Button onClick={connectGoogle}>Connect Google</Button>
      ) : (
        <Badge className="mb-4">Google Connected</Badge>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Google Sheet</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Paste Sheet URL or ID"
            value={sheetId}
            onChange={(e) => setSheetId(e.target.value)}
          />
          <Button className="mt-2" onClick={fetchSheetData}>
            Fetch Data
          </Button>
        </CardContent>
      </Card>

      {sheetData.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Leads</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  {sheetData[0].map((h, i) => <TableHead key={i}>{h}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sheetData.slice(1, 10).map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => <TableCell key={j}>{cell}</TableCell>)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Email Template</CardTitle>
        </CardHeader>
        <CardContent>
          <Input value={subjectTemplate} onChange={(e) => setSubjectTemplate(e.target.value)} />
          <Textarea className="mt-2" value={emailTemplate} onChange={(e) => setEmailTemplate(e.target.value)} />
          <Button className="mt-2" onClick={() => runAutomation('email')}>
            Send Emails
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>LinkedIn Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea value={linkedinTemplate} onChange={(e) => setLinkedinTemplate(e.target.value)} />
          <Button className="mt-2" onClick={() => runAutomation('linkedin')}>
            Generate Messages
          </Button>

          {generatedMessages.map((msg, i) => (
            <div key={i} className="mt-3 border p-2 rounded">
              <b>{msg.name}</b>
              <p>{msg.message}</p>
              <Button size="sm" onClick={() => copy(msg.message)}>Copy</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
