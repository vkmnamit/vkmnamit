import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { BookOpen, CheckCircle2, ChevronRight, CircleHelp, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogTitle } from '../ui/dialog';
import { useAuth } from '../../context/AuthContext';

export const SETUP_STEPS = [
  { title: 'Create the academic year', detail: 'Set the start and end dates, then mark the active academic year.', path: '/dashboard/academic-setup' },
  { title: 'Create classes and sections', detail: 'Add every grade, section, capacity, and class teacher before admitting students.', path: '/classes-sections' },
  { title: 'Add subjects and teaching staff', detail: 'Create subjects, register teachers, and assign their classes and sections.', path: '/subjects' },
  { title: 'Configure fees and communication', detail: 'Create fee structures, due dates, and verify email and WhatsApp communication settings.', path: '/fees' },
  { title: 'Register students and parents', detail: 'Add students one at a time or use School Onboarding for a bulk import.', path: '/students' },
  { title: 'Publish timetable and start operations', detail: 'Create the timetable, then begin attendance, assignments, exams, fee collection, and reports.', path: '/timetable' },
];

export function SetupGuideList({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  return (
    <ol className={compact ? 'space-y-2' : 'space-y-3'}>
      {SETUP_STEPS.map((step, index) => (
        <li key={step.title} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900">{step.title}</p>
            {!compact && <p className="mt-0.5 text-xs leading-5 text-gray-500">{step.detail}</p>}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-blue-600" onClick={() => navigate(step.path)} aria-label={`Open ${step.title}`}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </li>
      ))}
    </ol>
  );
}

export function SetupGuideModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const storageKey = user ? `kautix-setup-guide-dismissed:${user.id}` : '';

  useEffect(() => {
    if (user?.role === 'admin' && storageKey && !localStorage.getItem(storageKey)) setOpen(true);
  }, [storageKey, user?.role]);

  const dismiss = () => {
    if (storageKey) localStorage.setItem(storageKey, 'true');
    setOpen(false);
  };

  if (user?.role !== 'admin') return null;
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="sm:!max-w-2xl sm:!max-h-[88vh] p-0 overflow-hidden">
        <div className="bg-slate-950 px-5 py-6 pr-12 text-white sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600"><BookOpen className="h-5 w-5" /></div>
            <div>
              <DialogTitle className="text-left text-lg font-bold">Set Up Your School</DialogTitle>
              <p className="mt-1 text-sm text-slate-300">Complete these steps in order before starting daily operations.</p>
            </div>
          </div>
        </div>
        <div className="max-h-[calc(100dvh-210px)] overflow-y-auto p-5 sm:p-8">
          <SetupGuideList />
        </div>
        <div className="flex flex-col gap-2 border-t border-gray-100 bg-white p-4 sm:flex-row sm:justify-end sm:px-8">
          <Button variant="outline" className="w-full sm:w-auto" onClick={dismiss}><X className="mr-2 h-4 w-4" />Close</Button>
          <Button className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto" onClick={dismiss}><CheckCircle2 className="mr-2 h-4 w-4" />I will set this up later</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SetupHelpCard() {
  return (
    <section className="border-y border-blue-100 bg-blue-50/60 px-4 py-5 sm:px-6">
      <div className="mb-4 flex items-center gap-2 text-blue-900">
        <CircleHelp className="h-5 w-5" />
        <h2 className="text-base font-bold">Setup & Help</h2>
      </div>
      <p className="mb-5 text-sm text-blue-800">Use this sequence for a clean school setup. Each step opens the correct working page.</p>
      <SetupGuideList />
    </section>
  );
}
