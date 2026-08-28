import { useState, useRef, useEffect } from 'react';
import { Send, X, Bot, Sparkles, User, Zap, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { api } from '../../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { cn } from '../../../lib/utils';
import { useIsMobile } from '../ui/use-mobile';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';

const QUICK_ACTIONS = [
  { label: 'Create Student', prompt: 'Help me create a new student record', roles: ['admin'] },
  { label: 'Generate Timetable', prompt: 'Generate a timetable for my selected class section', roles: ['admin', 'teacher'] },
  { label: 'Create Assignment', prompt: 'Create an assignment for my class', roles: ['teacher'] },
  { label: 'Send Fee Reminder', prompt: 'Draft fee reminders for parents with pending fees', roles: ['admin'] },
  { label: 'Create Exam', prompt: 'Help me schedule a new exam', roles: ['admin', 'teacher'] },
  { label: "Today's Attendance", prompt: "Show today's attendance summary", roles: ['admin', 'teacher', 'parent', 'student'] },
  { label: 'Fee Defaulters', prompt: 'List students with pending fee payments', roles: ['admin'] },
  { label: 'My Academic Summary', prompt: 'Show my academic summary', roles: ['parent', 'student'] },
];

export function ChatBot() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedOpenStateRef = useRef(false);
  const quickActions = QUICK_ACTIONS.filter((action) => action.roles.includes(user?.role || ''));

  const [viewportHeight, setViewportHeight] = useState<number | string>('85vh');

  // Adjust height and hide FAB when virtual keyboard opens on mobile
  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      setViewportHeight(`${vv.height}px`);
      setKeyboardOpen(window.innerHeight - vv.height > 120);
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, [isMobile]);

  useEffect(() => {
    if (!isOpen) {
      loadedOpenStateRef.current = false;
      return;
    }
    if (loadedOpenStateRef.current) return;
    loadedOpenStateRef.current = true;
    let cancelled = false;
    const fetchHistory = async () => {
      try {
        setHistoryLoading(true);
        const history = await api.getChatHistory();
        if (cancelled) return;
        if (history?.messages?.length > 0) {
          setCurrentSessionId(history.sessionId || null);
          setMessages(history.messages.map((m: any) => ({ role: m.role, content: m.content })));
        } else {
          setMessages([
            {
              role: 'assistant',
              content: `Hello ${user?.name ? user.name.split(' ')[0] : 'there'}! I'm Kautix AI. How can I help you manage your school operations today?`,
            },
          ]);
        }
      } catch {
        if (cancelled) return;
        setMessages([
          {
            role: 'assistant',
            content: `Hello ${user?.name ? user.name.split(' ')[0] : 'there'}! I'm Kautix AI. How can I help you today?`,
          },
        ]);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    fetchHistory();
    return () => { cancelled = true; };
  }, [isOpen, user?.id]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [messages, loading]);

  const handleSend = async (text?: string) => {
    const userMessage = (text || input).trim();
    if (!userMessage || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);
    try {
      const response = await api.getChatbotResponse(userMessage, currentSessionId);
      if (response.sessionId) setCurrentSessionId(response.sessionId);
      setMessages(prev => [...prev, { role: 'assistant', content: response.reply }]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to reach the AI service.';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `I couldn't process that request. ${message}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const session = await api.createChatSession();
      setCurrentSessionId(session?.id || null);
      setMessages([{ role: 'assistant', content: `Hello ${user?.name ? user.name.split(' ')[0] : 'there'}! I'm Kautix AI. How can I help you today?` }]);
      setInput('');
    } catch {
      setMessages([{ role: 'assistant', content: "I couldn't start a new conversation right now. Please try again." }]);
    }
  };

  const formatContent = (content: string) => {
    return content.split('\n').map((line, i) => {
      if (line.startsWith('###')) {
        return <h3 key={i} className="text-base font-bold mt-3 mb-1 text-blue-800">{line.replace('###', '').trim()}</h3>;
      }
      if (line.startsWith('-')) {
        return <li key={i} className="ml-4 list-disc mb-1">{line.replace('-', '').trim()}</li>;
      }
      if (line.includes('**')) {
        const parts = line.split('**');
        return (
          <p key={i} className="mb-2">
            {parts.map((part, index) => index % 2 === 1 ? <strong key={index} className="font-bold text-blue-700">{part}</strong> : part)}
          </p>
        );
      }
      return line.trim() ? <p key={i} className="mb-2">{line}</p> : <br key={i} />;
    });
  };

  const chatMessages = (
    <div className="space-y-4">
      {!historyLoading && messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 pb-2">
          {quickActions.map(action => (
            <button
              key={action.label}
              onClick={() => handleSend(action.prompt)}
              className="text-[11px] font-bold px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors"
            >
              <Zap className="w-3 h-3 inline mr-1" />
              {action.label}
            </button>
          ))}
        </div>
      )}
      {messages.map((msg, idx) => (
        <div key={idx} className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
          <Avatar className={cn('w-8 h-8 shrink-0', msg.role === 'user' ? 'bg-blue-100' : 'bg-indigo-600 shadow-lg')}>
            <AvatarFallback className={msg.role === 'user' ? 'text-blue-600' : 'text-white'}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </AvatarFallback>
          </Avatar>
          <div className={cn(
            'p-3 sm:p-4 rounded-2xl max-w-[85%] text-sm shadow-sm leading-relaxed',
            msg.role === 'user'
              ? 'bg-blue-600 text-white rounded-tr-none'
              : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
          )}>
            {msg.role === 'assistant' ? formatContent(msg.content) : msg.content}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex gap-3">
          <Avatar className="w-8 h-8 bg-indigo-600">
            <AvatarFallback className="text-white"><Bot className="w-4 h-4" /></AvatarFallback>
          </Avatar>
          <div className="bg-white p-3 rounded-2xl rounded-tl-none border border-slate-100 shadow-sm flex gap-1">
            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        </div>
      )}
    </div>
  );

  const chatInput = (
    <div className="flex w-full gap-2 p-3 bg-white border-t">
      <Input
        placeholder="Ask about your school..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        className="h-12 bg-slate-50 border-slate-200 focus:ring-blue-500 focus:border-blue-500 text-base"
      />
      <Button size="icon" onClick={() => handleSend()} disabled={loading} className="h-12 w-12 bg-blue-600 hover:bg-blue-700 shadow-md shrink-0">
        <Send className="w-4 h-4" />
      </Button>
    </div>
  );

  const chatHeader = (
    <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 flex flex-row items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-md">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold">Kautix AI Advisor</p>
          <p className="text-[10px] text-blue-100 opacity-80">Enterprise Intelligence</p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={handleNewChat} aria-label="Start new chat" title="New chat">
          <Plus className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setIsOpen(false)} aria-label="Close chat" title="Close chat">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* FAB — hidden when keyboard open or chat open */}
      {!isOpen && !keyboardOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed z-40 w-14 h-14 rounded-full shadow-2xl bg-blue-600 hover:bg-blue-700 transition-all hover:scale-105"
          style={{ bottom: '24px', right: '20px' }}
          aria-label="Open AI Assistant"
        >
          <Bot className="w-6 h-6 text-white" />
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full" />
        </Button>
      )}

      {/* Mobile: Bottom Sheet */}
      {isMobile ? (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetContent side="bottom" style={{ height: viewportHeight }} className="p-0 rounded-t-2xl border-none flex flex-col gap-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Kautix AI Advisor</SheetTitle>
            </SheetHeader>
            {chatHeader}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
              {chatMessages}
            </div>
            <div className="shrink-0 pb-[env(safe-area-inset-bottom)]">{chatInput}</div>
          </SheetContent>
        </Sheet>
      ) : (
        isOpen && (
          <Card
            className="fixed z-50 shadow-2xl border-blue-100 overflow-hidden flex flex-col"
            style={{ right: '20px', bottom: '24px', width: '420px', height: '70vh', maxHeight: '680px' }}
          >
            {chatHeader}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 bg-slate-50/50">
              {chatMessages}
            </div>
            <div className="shrink-0">{chatInput}</div>
          </Card>
        )
      )}
    </>
  );
}
