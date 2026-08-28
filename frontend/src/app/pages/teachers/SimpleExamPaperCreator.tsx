import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/ui/dialog';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Textarea } from '../../components/ui/textarea';
import { toast } from 'sonner';
import { Plus, Trash2, Download, Eye, Save, ArrowRight, ArrowLeft, FileText, CheckCircle } from 'lucide-react';

type Step = 1 | 2 | 3 | 4;

export function SimpleExamPaperCreator() {
    const { user } = useAuth();
    const isStaff = user?.role === 'admin' || user?.role === 'teacher';
    const [currentStep, setCurrentStep] = useState<Step>(1);
    const [classes, setClasses] = useState<any[]>([]);
    const [subjects, setSubjects] = useState<any[]>([]);
    const [templates, setTemplates] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Step 1: Basic Information
    const [step1Data, setStep1Data] = useState({
        classId: '',
        subjectId: '',
        examType: 'midterm',
        academicYearId: '',
        paperTitle: '',
        duration: '180',
        maxMarks: '',
        templateId: '',
        generalInstructions: ''
    });

    // Step 2: Paper Structure
    const [sections, setSections] = useState([
        { name: 'A', title: 'Multiple Choice Questions', numQuestions: 0, marksPerQuestion: 1, totalMarks: 0 }
    ]);

    // Step 3: Questions
    const [questionsBySection, setQuestionsBySection] = useState<Record<string, any[]>>({});

    // Step 4: Preview
    const [previewOpen, setPreviewOpen] = useState(false);
    const [paperStatus, setPaperStatus] = useState('draft');

    // Initialize with empty data
    useState(() => {
        // Initialize questions object for each section
        const initial: Record<string, any[]> = {};
        sections.forEach(sec => {
            initial[sec.name] = [];
        });
        setQuestionsBySection(initial);
    });

    const loadInitialData = async () => {
        setLoading(true);
        try {
            const [classesData, subjectsData, templatesData] = await Promise.all([
                api.getClasses().catch(() => []),
                api.getSubjects().catch(() => []),
                api.getExamPaperTemplates().catch(() => [])
            ]);
            setClasses(Array.isArray(classesData) ? classesData : []);
            setSubjects(Array.isArray(subjectsData) ? subjectsData : []);
            setTemplates(Array.isArray(templatesData) ? templatesData : []);
        } catch (err) {
            console.error('Failed to load data:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleNext = () => {
        if (currentStep === 1) {
            if (!step1Data.classId || !step1Data.subjectId || !step1Data.paperTitle || !step1Data.maxMarks) {
                toast.error('Please fill all required fields');
                return;
            }
        }
        if (currentStep === 2) {
            const totalQuestions = sections.reduce((sum, sec) => sum + sec.numQuestions, 0);
            if (totalQuestions === 0) {
                toast.error('Please add at least one section with questions');
                return;
            }
        }
        setCurrentStep((currentStep + 1) as Step);
    };

    const handleBack = () => {
        setCurrentStep((currentStep - 1) as Step);
    };

    const addSection = () => {
        const newSection = {
            name: String.fromCharCode(65 + sections.length),
            title: '',
            numQuestions: 0,
            marksPerQuestion: 1,
            totalMarks: 0
        };
        setSections([...sections, newSection]);
    };

    const updateSection = (index: number, field: string, value: any) => {
        const updated = [...sections];
        updated[index] = { ...updated[index], [field]: value };
        if (field === 'numQuestions' || field === 'marksPerQuestion') {
            updated[index].totalMarks = (updated[index].numQuestions || 0) * (updated[index].marksPerQuestion || 0);
        }
        setSections(updated);
    };

    const removeSection = (index: number) => {
        if (sections.length <= 1) {
            toast.error('At least one section is required');
            return;
        }
        setSections(sections.filter((_, i) => i !== index));
    };

    const openQuestionInput = (sectionIndex: number) => {
        const section = sections[sectionIndex];
        const existing = questionsBySection[section.name] || [];
        const existingText = existing.map((q, i) => `${i + 1}. ${q.question_text} [${q.marks} marks]`).join('\n\n');

        const input = prompt(
            `Enter questions for Section ${section.name}: ${section.title || 'Untitled'}\n\nFormat: Question text [marks]\nOne question per line.\n\nExample:\nWhat is 2+2? [2 marks]\nExplain photosynthesis [5 marks]`,
            existingText
        );

        if (input !== null) {
            const parsed = parseQuestions(input, section);
            setQuestionsBySection({ ...questionsBySection, [section.name]: parsed });
            toast.success(`Added ${parsed.length} questions to Section ${section.name}`);
        }
    };

    const parseQuestions = (text: string, section: any): any[] => {
        const lines = text.split('\n').filter(line => line.trim());
        const questions: any[] = [];

        lines.forEach((line, index) => {
            const marksMatch = line.match(/\[(\d+)\s*marks?\]/i);
            const marks = marksMatch ? parseInt(marksMatch[1]) : section.marksPerQuestion || 1;
            const questionText = line.replace(/\[\d+\s*marks?\]/gi, '').trim();

            if (questionText) {
                questions.push({
                    id: `q-${Date.now()}-${index}`,
                    question_text: questionText,
                    marks: marks,
                    question_type: 'text',
                    difficulty: 'medium'
                });
            }
        });

        return questions;
    };

    const calculateTotalQuestions = () => {
        return sections.reduce((sum, sec) => sum + (questionsBySection[sec.name]?.length || 0), 0);
    };

    const calculateTotalMarks = () => {
        return sections.reduce((sum, sec) => {
            const questions = questionsBySection[sec.name] || [];
            return sum + questions.reduce((qSum, q) => qSum + q.marks, 0);
        }, 0);
    };

    const handlePreview = () => {
        setPreviewOpen(true);
    };

    const handleSave = async () => {
        if (!step1Data.templateId) {
            toast.error('Please select a template');
            return;
        }

        const totalQuestions = calculateTotalQuestions();
        if (totalQuestions === 0) {
            toast.error('Please add at least one question');
            return;
        }

        setSaving(true);
        try {
            const allQuestions: any[] = [];
            const allQuestionIds: string[] = [];

            sections.forEach((section, sIndex) => {
                const questions = questionsBySection[section.name] || [];
                questions.forEach((q, qIndex) => {
                    allQuestions.push({
                        questionId: q.id,
                        sectionId: null,
                        questionOrder: allQuestions.length + 1,
                        customMarks: q.marks,
                        customQuestionText: q.question_text,
                        questionType: q.question_type || 'text'
                    });
                    allQuestionIds.push(q.id);
                });
            });

            const payload = {
                templateId: step1Data.templateId,
                paperCode: `${step1Data.paperTitle.replace(/\s+/g, '-').toUpperCase()}-${Date.now()}`,
                totalMarks: calculateTotalMarks(),
                durationMinutes: parseInt(step1Data.duration),
                questions: allQuestions,
                status: paperStatus
            };

            await api.createExamPaper(payload);
            toast.success('Exam paper created successfully!');

            // Reset
            setCurrentStep(1);
            setStep1Data({
                classId: '',
                subjectId: '',
                examType: 'midterm',
                academicYearId: '',
                paperTitle: '',
                duration: '180',
                maxMarks: '',
                templateId: '',
                generalInstructions: ''
            });
            setSections([{ name: 'A', title: 'Multiple Choice Questions', numQuestions: 0, marksPerQuestion: 1, totalMarks: 0 }]);
            setQuestionsBySection({});
        } catch (err: any) {
            toast.error(err.message || 'Failed to create exam paper');
        } finally {
            setSaving(false);
        }
    };

    const generatePaperHTML = (): string => {
        let sectionsHTML = '';
        sections.forEach((section, sIndex) => {
            const questions = questionsBySection[section.name] || [];
            if (questions.length === 0) return;

            const questionsHTML = questions.map((q, qIndex) => `
                <div style="margin-bottom: 15px; page-break-inside: avoid;">
                    <div style="font-weight: bold;">${qIndex + 1}. ${q.question_text} [${q.marks} marks]</div>
                </div>
            `).join('');

            sectionsHTML += `
                <div style="margin-bottom: 25px;">
                    <div style="background-color: #f0f0f0; padding: 10px; margin-bottom: 15px; font-weight: bold; font-size: 14px;">
                        Section ${section.name}: ${section.title} (${section.totalMarks} marks)
                    </div>
                    <div style="margin-top: 10px;">
                        ${questionsHTML}
                    </div>
                </div>
            `;
        });

        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${step1Data.paperTitle || 'Exam Paper'}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Times New Roman', Times, serif;
            padding: 40px;
            line-height: 1.6;
        }
        .header {
            text-align: center;
            border-bottom: 3px solid #000;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .school-name {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 10px;
        }
        .exam-title {
            font-size: 20px;
            font-weight: bold;
            margin: 10px 0;
        }
        .paper-info {
            display: flex;
            justify-content: space-between;
            margin-top: 20px;
            font-size: 14px;
        }
        .general-instructions {
            background-color: #f9f9f9;
            padding: 15px;
            margin-bottom: 25px;
            border: 1px solid #ddd;
        }
        .instructions-title {
            font-weight: bold;
            margin-bottom: 10px;
        }
        .instructions-list {
            margin-left: 20px;
            font-size: 13px;
        }
        @media print {
            body { padding: 20px; }
            .no-print { display: none; }
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="school-name">Your School Name</div>
        <div class="exam-title">${step1Data.paperTitle || 'Examination'}</div>
        <div class="paper-info">
            <div>Max Marks: ${calculateTotalMarks()}</div>
            <div>Duration: ${step1Data.duration} minutes</div>
        </div>
    </div>

    ${step1Data.generalInstructions ? `
        <div class="general-instructions">
            <div class="instructions-title">General Instructions:</div>
            <div class="instructions-list">
                ${step1Data.generalInstructions.split('\n').map(line => `<li>${line}</li>`).join('')}
            </div>
        </div>
    ` : ''}

    <div class="content">
        ${sectionsHTML}
    </div>

    <div class="no-print" style="margin-top: 30px; text-align: center;">
        <button onclick="window.print()" style="padding: 10px 30px; font-size: 14px; cursor: pointer;">
            Print / Save as PDF
        </button>
    </div>
</body>
</html>
    `;
    };

    if (!isStaff) {
        return <div className="p-6"><Card className="border-red-200 bg-red-50"><CardContent className="pt-6"><p className="text-red-600 font-semibold">Access denied. Exam paper creation is only available to teachers and administrators.</p></CardContent></Card></div>;
    }

    if (loading) {
        return <div className="p-6">Loading...</div>;
    }

    return (
        <div className="space-y-6 p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Create Exam Paper</h1>
                    <p className="text-gray-500 mt-1">Step {currentStep} of 4</p>
                </div>
                <div className="flex gap-2">
                    {currentStep > 1 && (
                        <Button variant="outline" onClick={handleBack}>
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    )}
                    {currentStep < 4 && (
                        <Button onClick={handleNext}>
                            Next
                            <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                    )}
                    {currentStep === 4 && (
                        <>
                            <Button variant="outline" onClick={handlePreview}>
                                <Eye className="w-4 h-4 mr-2" />
                                Preview
                            </Button>
                            <Button onClick={handleSave} loading={saving}>
                                <Save className="w-4 h-4 mr-2" />
                                Save Paper
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Progress Bar */}
            <div className="flex gap-2">
                {[1, 2, 3, 4].map((step) => (
                    <div key={step} className="flex-1 h-2 rounded-full bg-gray-200">
                        <div
                            className={`h-2 rounded-full ${step <= currentStep ? 'bg-blue-600' : 'bg-gray-200'}`}
                            style={{ width: step <= currentStep ? '100%' : '0%' }}
                        />
                    </div>
                ))}
            </div>

            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Step 1: Basic Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Class *</Label>
                                <Select value={step1Data.classId} onValueChange={(val) => setStep1Data({ ...step1Data, classId: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select class" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {classes.map((cls: any) => (
                                            <SelectItem key={cls.id} value={cls.id}>{cls.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Subject *</Label>
                                <Select value={step1Data.subjectId} onValueChange={(val) => setStep1Data({ ...step1Data, subjectId: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select subject" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {subjects.map((sub: any) => (
                                            <SelectItem key={sub.id} value={sub.id}>{sub.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Exam Type *</Label>
                                <Select value={step1Data.examType} onValueChange={(val) => setStep1Data({ ...step1Data, examType: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select exam type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="midterm">Mid-Term</SelectItem>
                                        <SelectItem value="final">Final Exam</SelectItem>
                                        <SelectItem value="unit">Unit Test</SelectItem>
                                        <SelectItem value="quarterly">Quarterly</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Academic Year</Label>
                                <Select value={step1Data.academicYearId} onValueChange={(val) => setStep1Data({ ...step1Data, academicYearId: val })}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select year" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="2024-2025">2024-2025</SelectItem>
                                        <SelectItem value="2025-2026">2025-2026</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Paper Title *</Label>
                            <Input
                                value={step1Data.paperTitle}
                                onChange={(e) => setStep1Data({ ...step1Data, paperTitle: e.target.value })}
                                placeholder="e.g., Mid-Term Mathematics Examination"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Duration (minutes) *</Label>
                                <Input
                                    type="number"
                                    value={step1Data.duration}
                                    onChange={(e) => setStep1Data({ ...step1Data, duration: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Maximum Marks *</Label>
                                <Input
                                    type="number"
                                    value={step1Data.maxMarks}
                                    onChange={(e) => setStep1Data({ ...step1Data, maxMarks: e.target.value })}
                                    placeholder="100"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>Use Template (Optional)</Label>
                            <Select value={step1Data.templateId} onValueChange={(val) => setStep1Data({ ...step1Data, templateId: val })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select template or create custom" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">Custom Paper</SelectItem>
                                    {templates.map((template: any) => (
                                        <SelectItem key={template.id} value={template.id}>
                                            {template.name} ({template.total_marks} marks)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>General Instructions</Label>
                            <Textarea
                                value={step1Data.generalInstructions}
                                onChange={(e) => setStep1Data({ ...step1Data, generalInstructions: e.target.value })}
                                placeholder="Enter general instructions for students..."
                                rows={4}
                            />
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Step 2: Paper Structure */}
            {currentStep === 2 && (
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Step 2: Paper Structure</CardTitle>
                            <Button onClick={addSection} variant="outline" size="sm">
                                <Plus className="w-4 h-4 mr-1" />
                                Add Section
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {sections.map((section, index) => (
                            <Card key={index} className="p-4">
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                    <div className="space-y-2">
                                        <Label>Section Name</Label>
                                        <Input
                                            value={section.name}
                                            onChange={(e) => updateSection(index, 'name', e.target.value)}
                                            placeholder="A, B, C..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Section Title</Label>
                                        <Input
                                            value={section.title}
                                            onChange={(e) => updateSection(index, 'title', e.target.value)}
                                            placeholder="MCQ, Short Answer..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>No. of Questions</Label>
                                        <Input
                                            type="number"
                                            value={section.numQuestions}
                                            onChange={(e) => updateSection(index, 'numQuestions', parseInt(e.target.value) || 0)}
                                            placeholder="5"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Marks per Q</Label>
                                        <Input
                                            type="number"
                                            value={section.marksPerQuestion}
                                            onChange={(e) => updateSection(index, 'marksPerQuestion', parseInt(e.target.value) || 0)}
                                            placeholder="1"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Total Marks</Label>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={section.totalMarks}
                                                readOnly
                                                className="bg-gray-50"
                                            />
                                            {sections.length > 1 && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeSection(index)}
                                                    className="text-red-500"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}

                        {/* Live Summary */}
                        <Card className="bg-blue-50 border-blue-200">
                            <CardContent className="pt-6">
                                <h3 className="font-semibold mb-3">Live Summary</h3>
                                <div className="grid grid-cols-3 gap-4 text-center">
                                    <div>
                                        <p className="text-2xl font-bold text-blue-600">{sections.length}</p>
                                        <p className="text-sm text-gray-600">Sections</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-blue-600">
                                            {sections.reduce((sum, sec) => sum + sec.numQuestions, 0)}
                                        </p>
                                        <p className="text-sm text-gray-600">Questions</p>
                                    </div>
                                    <div>
                                        <p className="text-2xl font-bold text-blue-600">
                                            {sections.reduce((sum, sec) => sum + sec.totalMarks, 0)}
                                        </p>
                                        <p className="text-sm text-gray-600">Marks</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </CardContent>
                </Card>
            )}

            {/* Step 3: Questions */}
            {currentStep === 3 && (
                <div className="space-y-4">
                    {sections.map((section, index) => {
                        const questions = questionsBySection[section.name] || [];
                        return (
                            <Card key={index}>
                                <CardHeader>
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <CardTitle>Section {section.name}: {section.title || 'Untitled'}</CardTitle>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {questions.length} questions added | Total: {section.totalMarks} marks
                                            </p>
                                        </div>
                                        <Button onClick={() => openQuestionInput(index)} variant="outline" size="sm">
                                            <FileText className="w-4 h-4 mr-1" />
                                            {questions.length > 0 ? 'Edit Questions' : 'Add Questions'}
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    {questions.length > 0 ? (
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {questions.map((q, qIndex) => (
                                                <div key={q.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded">
                                                    <Badge variant="outline" className="mt-1">{qIndex + 1}</Badge>
                                                    <div className="flex-1">
                                                        <p className="text-sm">{q.question_text}</p>
                                                        <Badge variant="secondary" className="text-xs mt-1">{q.marks} marks</Badge>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-gray-400">
                                            <p>No questions added yet</p>
                                            <p className="text-sm mt-2">Click "Add Questions" to add questions for this section</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}

                    {/* Live Right Panel */}
                    <Card className="bg-green-50 border-green-200">
                        <CardContent className="pt-6">
                            <h3 className="font-semibold mb-3">Paper Summary</h3>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span className="text-sm">Questions Added: {calculateTotalQuestions()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span className="text-sm">Marks Completed: {calculateTotalMarks()}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                    <span className="text-sm">Total Marks: {calculateTotalMarks()}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Step 4: Preview */}
            {currentStep === 4 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Step 4: Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="border-2 border-gray-200 rounded-lg p-8 bg-white">
                            <div className="text-center border-b-2 border-black pb-4 mb-6">
                                <h1 className="text-2xl font-bold">{step1Data.paperTitle || 'Exam Paper'}</h1>
                                <p className="text-sm mt-1">Max Marks: {calculateTotalMarks()} | Duration: {step1Data.duration} minutes</p>
                            </div>

                            {step1Data.generalInstructions && (
                                <div className="bg-gray-50 p-4 rounded mb-6">
                                    <h3 className="font-bold mb-2">General Instructions:</h3>
                                    <p className="text-sm whitespace-pre-wrap">{step1Data.generalInstructions}</p>
                                </div>
                            )}

                            {sections.map((section, sIndex) => {
                                const questions = questionsBySection[section.name] || [];
                                if (questions.length === 0) return null;

                                return (
                                    <div key={sIndex} className="mb-6">
                                        <div className="bg-gray-100 p-2 mb-3 font-bold">
                                            Section {section.name}: {section.title} ({section.totalMarks} marks)
                                        </div>
                                        {questions.map((q, qIndex) => (
                                            <div key={q.id} className="mb-3 pl-4">
                                                <p className="font-bold">
                                                    {qIndex + 1}. {q.question_text} [{q.marks} marks]
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}