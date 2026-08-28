import { useState } from 'react';
import { api } from '../../../lib/api';
import { Upload, Users, GraduationCap, Receipt, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';
import { SetupHelpCard } from '../../components/onboarding/SetupGuide';

export default function SchoolOnboarding() {
  const [activeTab, setActiveTab] = useState('teachers');
  const [jsonData, setJsonData] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  const handleImport = async () => {
    if (!jsonData.trim()) {
      toast.error('Please paste valid JSON data');
      return;
    }

    try {
      setLoading(true);
      setResults(null);
      const parsed = JSON.parse(jsonData);

      if (!Array.isArray(parsed)) {
        toast.error('JSON must be an array of objects');
        return;
      }

      let res;
      if (activeTab === 'teachers') {
        res = await api.importTeachers(parsed);
      } else if (activeTab === 'students') {
        res = await api.importStudents(parsed);
      } else if (activeTab === 'fees') {
        res = await api.importFeeStructures(parsed);
      }

      setResults(res?.results || []);
      const ok = (res?.results || []).filter((r: any) => r.success === true || r.status === 'success').length;
      toast.success(`Import complete: ${ok} succeeded`);
      setJsonData('');
    } catch (e: any) {
      toast.error(e.message || 'Invalid JSON or import failed');
    } finally {
      setLoading(false);
    }
  };

  const getTemplate = () => {
    if (activeTab === 'teachers') {
      return `[\n  {\n    "email": "teacher1@example.com",\n    "first_name": "John",\n    "last_name": "Doe",\n    "phone": "9876543210",\n    "department": "Science",\n    "designation": "Senior Teacher"\n  }\n]`;
    }
    if (activeTab === 'students') {
      return `[\n  {\n    "email": "student1@example.com",\n    "first_name": "Alice",\n    "last_name": "Smith",\n    "existing_academic_year": "2026-2027",\n    "existing_class_name": "Class 10",\n    "existing_section_name": "Section A",\n    "father_name": "Bob Smith",\n    "guardian_email": "parent@example.com",\n    "guardian_phone": "9998887776"\n  }\n]`;
    }
    if (activeTab === 'fees') {
      return `[\n  {\n    "name": "Annual Tuition Fee",\n    "amount": 25000,\n    "frequency": "annual",\n    "academic_year_id": "UUID_OF_YEAR"\n  }\n]`;
    }
    return '';
  };

  const tabs = [
    { id: 'teachers', label: 'Teachers', icon: GraduationCap },
    { id: 'students', label: 'Students & Parents', icon: Users },
    { id: 'fees', label: 'Fee Structures', icon: Receipt },
  ];

  return (
    <div className="w-full max-w-full overflow-x-hidden pb-24 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Setup & Help</h1>
        <p className="text-gray-500 text-sm mt-1">Follow the initial setup sequence, then use bulk imports for teachers, students, and fee rules.</p>
      </div>

      <SetupHelpCard />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap bg-gray-100 p-1 rounded-xl w-full">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setResults(null); setJsonData(''); }}
              className={`flex-1 min-w-0 flex items-center justify-center gap-2 py-3 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${activeTab === tab.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="border border-gray-100 shadow-sm rounded-2xl overflow-hidden bg-white w-full">
        <div className="bg-gray-50 border-b border-gray-100 p-4 sm:p-6">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
            <Upload className="w-5 h-5 text-blue-600 shrink-0" />
            Import {activeTab === 'teachers' ? 'Faculty' : activeTab === 'students' ? 'Students & Parents' : 'Fee Structures'}
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm mt-1">
            Paste a JSON array. Student rows must reference an existing class and section; parents are linked automatically when guardian contact is provided.
          </p>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
          <div className="space-y-4 w-full">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">JSON Payload</label>
              <textarea
                className="w-full min-h-[200px] sm:min-h-[280px] mt-2 rounded-xl border border-gray-200 p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Paste JSON array here..."
                value={jsonData}
                onChange={e => setJsonData(e.target.value)}
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" className="w-full sm:w-auto rounded-xl" onClick={() => setJsonData(getTemplate())}>
                Load Template
              </Button>
              <Button className="w-full sm:flex-1 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold" loading={loading} onClick={handleImport}>
                {loading ? 'Importing...' : 'Run Import'}
              </Button>
            </div>
          </div>

          <div className="space-y-3 w-full">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Results</p>
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 min-h-[200px] max-h-[50vh] overflow-y-auto w-full">
              {!results ? (
                <p className="text-sm text-gray-400 text-center py-8">Results will appear here after import</p>
              ) : results.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No results returned</p>
              ) : (
                <div className="space-y-2">
                  {results.map((r, i) => (
                    <div key={i} className={`p-3 rounded-lg border text-sm flex items-start gap-2 ${(r.success === true || r.status === 'success') ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                      {(r.success === true || r.status === 'success') ? <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" /> : <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{r.email || r.admissionNumber || r.name || `Row ${i + 1}`}</p>
                        {(r.error || (r.status === 'error' && r.message)) && <p className="text-xs text-red-600 mt-0.5">{r.error || r.message}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
