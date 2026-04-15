import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mail, 
  Linkedin, 
  FileSpreadsheet, 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Settings, 
  Play,
  RefreshCw,
  LogOut
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
  const [status, setStatus] = useState({ googleConnected: false, linkedinConnected: false, configSet: false, redirectUri: '' });
  const [sheetId, setSheetId] = useState('');
  const [sheetData, setSheetData] = useState<string[][]>([]);
  const [loading, setLoading] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState('Hi {{Name}},\n\nI saw your work and would love to connect!');
  const [linkedinTemplate, setLinkedinTemplate] = useState('Hi {{Name}}, I would love to connect with you on LinkedIn!');
  const [subjectTemplate, setSubjectTemplate] = useState('Connecting with {{Name}}');
  const [isProcessing, setIsProcessing] = useState(false);

  const [generatedMessages, setGeneratedMessages] = useState<{ name: string, message: string }[]>([]);

  useEffect(() => {
    checkStatus();
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkStatus();
        toast.success(`${event.data.provider} connected successfully!`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkStatus = async () => {
    try {
      const res = await fetch('/api/user/status');
      const data = await res.json();
      setStatus({ ...data, linkedinConnected: true }); // Mock LinkedIn as always "ready" for generation
    } catch (err) {
      console.error('Failed to check status', err);
    }
  };

  const disconnect = async (provider: 'google') => {
    try {
      await fetch(`/api/auth/${provider}/logout`, { method: 'POST' });
      checkStatus();
      setSheetData([]);
      toast.success(`${provider} disconnected`);
    } catch (err) {
      toast.error(`Failed to disconnect ${provider}`);
    }
  };

  const connect = async (provider: 'google') => {
    if (!status.configSet) {
      return toast.error('Google Client ID/Secret not found. Please add them to the Secrets panel in Settings.');
    }
    try {
      const res = await fetch(`/api/auth/${provider}/url`);
      const { url } = await res.json();
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      toast.error(`Failed to get ${provider} auth URL`);
    }
  };

  const extractSheetId = (input: string) => {
    const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) return match[1];
    return input.split('/')[0].trim();
  };

  const fetchSheetData = async () => {
    if (!status.googleConnected) {
      return toast.error('Please click "Connect Google" first to authorize access.');
    }
    const id = extractSheetId(sheetId);
    if (!id) return toast.error('Please enter a Google Sheet ID or URL');
    setLoading(true);
    try {
      const res = await fetch(`/api/sheets/data?sheetId=${id}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSheetData(data.values || []);
      toast.success('Sheet data fetched successfully');
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('401') || msg.toLowerCase().includes('not connected')) {
        toast.error('Please connect your Google account first.');
      } else if (msg.includes('403') || msg.toLowerCase().includes('permission')) {
        toast.error('Permission denied. Ensure the sheet is shared with you or is public.');
      } else {
        toast.error('Failed to fetch data. Check your Sheet ID and ensure Google OAuth is configured in the Secrets panel.');
      }
    } finally {
      setLoading(false);
    }
  };

  const replaceVariables = (template: string, row: string[], headers: string[]) => {
    let result = template;
    headers.forEach((header, index) => {
      const value = row[index] || '';
      result = result.replace(new RegExp(`{{${header}}}`, 'g'), value);
    });
    return result;
  };

  const runAutomation = async (type: 'email' | 'linkedin' | 'combined') => {
    if (sheetData.length < 2) return toast.error('No data to process');
    setIsProcessing(true);
    const headers = sheetData[0];
    const rows = sheetData.slice(1);

    let emailSuccess = 0;
    let failCount = 0;
    const newGeneratedMessages: { name: string, message: string }[] = [];

    const emailIndex = headers.findIndex(h => h.toLowerCase().includes('email'));
    const nameIndex = headers.findIndex(h => h.toLowerCase().includes('name'));

    for (const row of rows) {
      try {
        // Handle Email
        if ((type === 'email' || type === 'combined') && emailIndex !== -1) {
          const to = row[emailIndex];
          if (to && to.includes('@')) {
            const subject = replaceVariables(subjectTemplate, row, headers);
            const body = replaceVariables(emailTemplate, row, headers);

            const res = await fetch('/api/send/email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to, subject, body })
            });
            if (res.ok) {
              emailSuccess++;
            }
          }
        }

        // Handle LinkedIn Generation (No API call)
        if (type === 'linkedin' || type === 'combined') {
          const name = nameIndex !== -1 ? row[nameIndex] : `Lead ${newGeneratedMessages.length + 1}`;
          const message = replaceVariables(linkedinTemplate, row, headers);
          newGeneratedMessages.push({ name, message });
        }

      } catch (err) {
        console.error(err);
        failCount++;
      }
    }

    setGeneratedMessages(newGeneratedMessages);
    
    toast.success(`Automation complete!
      ${emailSuccess > 0 ? `Emails Sent: ${emailSuccess} ` : ''}
      ${newGeneratedMessages.length > 0 ? `LinkedIn Messages Generated: ${newGeneratedMessages.length} ` : ''}
      ${failCount > 0 ? `Failed: ${failCount}` : ''}`);
    setIsProcessing(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans p-4 md:p-8">
      <Toaster position="top-right" />
      
      <header className="max-w-6xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <RefreshCw className="w-8 h-8 text-blue-600" />
            EmailSender <span className="text-sm font-normal text-muted-foreground bg-blue-50 px-2 py-1 rounded">Clay Edition</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            EmailSender is a multi-channel outreach automation tool designed for HR professionals. 
            It connects to your Google Sheets to fetch lead data from Clay and automates personalized 
            email outreach via Gmail while generating tailored LinkedIn messages.
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant={status.googleConnected ? "default" : "outline"} className="gap-1 px-3 py-1">
            {status.googleConnected ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
            Google (Email)
          </Badge>
        </div>
      </header>

      <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Setup */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Connections
              </CardTitle>
              <CardDescription>Connect Google to send emails</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2">
                <Button 
                  variant={status.googleConnected ? "outline" : "default"} 
                  className="w-full justify-start gap-3 h-12"
                  onClick={() => connect('google')}
                >
                  <Mail className="w-5 h-5" />
                  {status.googleConnected ? 'Google Connected' : 'Connect Google'}
                </Button>
                {status.googleConnected && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                    onClick={() => disconnect('google')}
                  >
                    <LogOut className="w-3 h-3 mr-1" />
                    Disconnect & Switch Account
                  </Button>
                )}
                {!status.googleConnected && status.redirectUri && (
                  <div className="mt-4 p-3 bg-muted/50 rounded text-[10px] space-y-1 border">
                    <p className="font-bold text-muted-foreground uppercase">OAuth Setup Help</p>
                    <p>Ensure this URL is added to your Google Cloud Console "Authorized redirect URIs":</p>
                    <code className="block p-1 bg-white border rounded break-all select-all">
                      {status.redirectUri}
                    </code>
                    <p className="text-blue-600 cursor-pointer hover:underline" onClick={() => copyToClipboard(status.redirectUri)}>
                      Click to copy URL
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" />
                Clay / Google Sheet
              </CardTitle>
              <CardDescription>Enter the ID of the sheet Clay is filling</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Spreadsheet ID</label>
                <Input 
                  placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZj..." 
                  value={sheetId}
                  onChange={(e) => setSheetId(e.target.value)}
                />
              </div>
              <Button 
                className="w-full gap-2" 
                onClick={fetchSheetData}
                disabled={loading}
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Fetch Leads
              </Button>
              {!status.googleConnected && (
                <p className="text-[10px] text-red-500 text-center mt-1">
                  * Connect Google account first
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm bg-blue-600 text-white">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Send className="w-5 h-5" />
                Combined Campaign
              </CardTitle>
              <CardDescription className="text-blue-100">Send Emails & Generate LinkedIn Messages</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                variant="secondary"
                className="w-full gap-2 h-12 font-bold"
                onClick={() => runAutomation('combined')}
                disabled={isProcessing || sheetData.length < 2 || !status.googleConnected}
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Launch Multi-Channel
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Templates & Data */}
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="data" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-white border shadow-sm">
              <TabsTrigger value="data">Lead Data</TabsTrigger>
              <TabsTrigger value="email">Email Template</TabsTrigger>
              <TabsTrigger value="linkedin">LinkedIn Messages</TabsTrigger>
            </TabsList>

            <TabsContent value="data" className="mt-6">
              <Card className="border-none shadow-sm overflow-hidden">
                <CardHeader>
                  <CardTitle>Leads from Clay</CardTitle>
                  <CardDescription>We'll look for "Email", "Name", "Company", and "Role" columns</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[500px] overflow-auto">
                    {sheetData.length > 0 ? (
                      <Table>
                        <TableHeader className="bg-muted/50 sticky top-0">
                          <TableRow>
                            {sheetData[0].map((header, i) => (
                              <TableHead key={i} className="whitespace-nowrap">{header}</TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sheetData.slice(1, 20).map((row, i) => (
                            <TableRow key={i}>
                              {row.map((cell, j) => (
                                <TableCell key={j} className="max-w-[200px] truncate">{cell}</TableCell>
                              ))}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="p-12 text-center text-muted-foreground">
                        No leads fetched yet. Connect Google and enter your Clay-linked Sheet ID.
                      </div>
                    )}
                  </div>
                </CardContent>
                {sheetData.length > 20 && (
                  <CardFooter className="bg-muted/20 py-2 text-xs text-center justify-center">
                    Showing first 20 leads of {sheetData.length - 1} total
                  </CardFooter>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="email" className="mt-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>Email Template</CardTitle>
                  <CardDescription>Personalize your message to HR leads</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Subject Line</label>
                    <Input 
                      value={subjectTemplate}
                      onChange={(e) => setSubjectTemplate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email Body</label>
                    <Textarea 
                      className="min-h-[250px]"
                      value={emailTemplate}
                      onChange={(e) => setEmailTemplate(e.target.value)}
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button 
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => runAutomation('email')}
                    disabled={isProcessing || sheetData.length < 2 || !status.googleConnected}
                  >
                    Run Email Only
                  </Button>
                </CardFooter>
              </Card>
            </TabsContent>

            <TabsContent value="linkedin" className="mt-6">
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle>LinkedIn Messages</CardTitle>
                  <CardDescription>Generate personalized messages to copy-paste</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Message Template</label>
                    <Textarea 
                      className="min-h-[100px]"
                      value={linkedinTemplate}
                      onChange={(e) => setLinkedinTemplate(e.target.value)}
                      placeholder="Hi {{Name}}, I saw you are a {{Role}} at {{Company}}..."
                    />
                  </div>
                  
                  <Button 
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => runAutomation('linkedin')}
                    disabled={isProcessing || sheetData.length < 2}
                  >
                    Generate All Messages
                  </Button>

                  <div className="space-y-4 mt-6">
                    {generatedMessages.map((msg, i) => (
                      <div key={i} className="p-4 bg-muted/30 rounded-lg border space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-sm">{msg.name}</span>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(msg.message)}>
                            Copy
                          </Button>
                        </div>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{msg.message}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
        <p>© 2026 AutoReach Automation Tool. Built for Google AI Studio.</p>
      </footer>
    </div>
  );
}
