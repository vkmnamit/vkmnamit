import { useState, useEffect } from 'react';
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
import { Plus, Trash2, Download, Eye, Save } from 'lucide-react';

export function ExamPaperCreationPage() {
    const { user } = useAuth();
    const [templates, setTemplates] = useState<any[]>([]);
    const [questions, setQuestions] = useState<any[]>([]);
    const [classes, setClasses] = useState<any[]>([]);
    const [subjects, setSubjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form state
    const [selectedTemplate, setSelectedTemplate] = useState('');
    const [selectedClass, setSelectedClass] = useState('');
    const [selectedSubject, setSelectedSubject] = useState('');
    const [paperCode, setPaperCode] = useState('');
    const [paperTitle, setPaperTitle] = useState('');
    const [duration, setDuration] = useState('180');
    const [totalMarks, setTotalMarks] = useState('');
    const [generalInstructions, setGeneralInstructions] = useState('');
    const [selectedQuestions, setSelectedQuestions] = useState<any[]>([]);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [questionBankOpen, setQuestionBankOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchInitialData();
    }, []);

    const fetchInitialData = async () => {
        try {
            const [templatesData, classesData, subjectsData] = await Promise.all([
                api.getExamPaperTemplates(),
                api.getClasses(),
                api.getSubjects()
            ]);
            setTemplates(templatesData || []);
            setClasses(classesData || []);
            setSubjects(subjectsData || []);
        } catch (err: any) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const loadQuestions = async () => {
        if (!selectedClass || !selectedSubject) {
            toast.error('Please select class and subject first');
            return;
        }

        try {
            const data = await api.getQuestions({
                classId: selectedClass,
                subjectId: selectedSubject,
                search: searchQuery || undefined
            });
            setQuestions(data || []);
        } catch (err: any) {
            toast.error('Failed to load questions');
        }
    };

    useEffect(() => {
        if (questionBankOpen) {
            loadQuestions();
        }
    }, [questionBankOpen, selectedClass, selectedSubject, searchQuery]);

    const handleTemplateChange = (templateId: string) => {
        setSelectedTemplate(templateId);
        const template = templates.find(t => t.id === templateId);
        if (template) {
            setPaperTitle(template.name);
            setDuration(String(template.duration_minutes));
            setTotalMarks(String(template.total_marks));
            setGeneralInstructions(template.general_instructions || '');
        }
    };

    const addQuestionToPaper = (question: any) => {
        if (selectedQuestions.find(q => q.id === question.id)) {
            toast.error('Question already added');
            return;
        }
        setSelectedQuestions([...selectedQuestions, { ...question, customMarks: question.marks }]);
    };

    const removeQuestion = (questionId: string) => {
        setSelectedQuestions(selectedQuestions.filter(q => q.id !== questionId));
    };

    const updateQuestionMarks = (questionId: string, marks: number) => {
        setSelectedQuestions(selectedQuestions.map(q =>
            q.id === questionId ? { ...q, customMarks: marks } : q
        ));
    };

    const calculateTotalMarks = () => {
        return selectedQuestions.reduce((sum, q) => sum + (q.customMarks || q.marks), 0);
    };

    const handleSavePaper = async () => {
        if (!selectedTemplate || !paperCode || selectedQuestions.length === 0) {
            toast.error('Please fill all required fields and add at least one question');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                templateId: selectedTemplate,
                paperCode,
                totalMarks: calculateTotalMarks(),
                durationMinutes: parseInt(duration),
                questions: selectedQuestions.map((q, index) => ({
                    questionId: q.id,
                    sectionId: null, // You can enhance this to assign sections
                    questionOrder: index + 1,
                    customMarks: q.customMarks || q.marks
                }))
            };

            await api.createExamPaper(payload);
            toast.success('Exam paper created successfully!');

            // Reset form
            setSelectedQuestions([]);
            setPaperCode('');
        } catch (err: any) {
            toast.error(err.message || 'Failed to create exam paper');
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadHTML = async () => {
        if (!selectedTemplate) {
            toast.error('Please select a template first');
            return;
        }

        try {
            const html = await api.generateExamPaperHTML(selectedTemplate);

            // Create blob and download
            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${paperTitle || 'exam-paper'}.html`;
            a.click();
            URL.revokeObjectURL(url);

            toast.success('Paper downloaded successfully!');
        } catch (err: any) {
            toast.error('Failed to download paper');
        }
    };

    if (loading) {
        return <div className="p-6">Loading...</div>;
    }

    return (
        <div className="space-y-6 p-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold">Create Question Paper</h1>
                    <p className="text-gray-500 mt-1">Build exam papers from templates and question bank</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setPreviewOpen(true)} disabled={selectedQuestions.length === 0}>
                        <Eye className="w-4 h-4 mr-2" />
                        Preview
                    </Button>
                    <Button variant="outline" onClick={handleDownloadHTML} disabled={!selectedTemplate}>
                        <Download className="w-4 h-4 mr-2" />
                        Download HTML
                    </Button>
                    <Button onClick={handleSavePaper} loading={saving}>
                        <Save className="w-4 h-4 mr-2" />
                        Save Paper
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Panel - Configuration */}
                <div className="lg:col-span-1 space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Paper Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Template *</Label>
                                <Select value={selectedTemplate} onValueChange={handleTemplateChange}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select template" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {templates.map((template: any) => (
                                            <SelectItem key={template.id} value={template.id}>
                                                {template.name} ({template.total_marks} marks)
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Paper Code *</Label>
                                <Input
                                    value={paperCode}
                                    onChange={(e) => setPaperCode(e.target.value)}
                                    placeholder="e.g., MATH-MID-2024-001"
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Paper Title</Label>
                                <Input
                                    value={paperTitle}
                                    onChange={(e) => setPaperTitle(e.target.value)}
                                    placeholder="e.g., Mid-Term Examination"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <Label>Duration (mins)</Label>
                                    <Input
                                        type="number"
                                        value={duration}
                                        onChange={(e) => setDuration(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Total Marks</Label>
                                    <Input
                                        type="number"
                                        value={totalMarks}
                                        onChange={(e) => setTotalMarks(e.target.value)}
                                        disabled
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>General Instructions</Label>
                                <Textarea
                                    value={generalInstructions}
                                    onChange={(e) => setGeneralInstructions(e.target.value)}
                                    placeholder="Enter general instructions..."
                                    rows={4}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Statistics</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Questions Added:</span>
                                    <span className="font-bold">{selectedQuestions.length}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Total Marks:</span>
                                    <span className="font-bold">{calculateTotalMarks()}</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Right Panel - Questions */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <CardHeader>
                            <div className="flex justify-between items-center">
                                <CardTitle>Questions ({selectedQuestions.length})</CardTitle>
                                <Button onClick={() => setQuestionBankOpen(true)}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add from Bank
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {selectedQuestions.length === 0 ? (
                                <div className="text-center py-12 text-gray-400">
                                    <p>No questions added yet.</p>
                                    <p className="text-sm mt-2">Click "Add from Bank" to add questions from the question bank</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {selectedQuestions.map((question, index) => (
                                        <Card key={question.id} className="p-4">
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Badge>Q{index + 1}</Badge>
                                                        <Badge variant="outline">{question.question_type}</Badge>
                                                        <Badge variant="secondary">{question.difficulty}</Badge>
                                                    </div>
                                                    <p className="text-sm mb-3">{question.question_text}</p>
                                                    <div className="flex items-center gap-2">
                                                        <Label className="text-xs">Marks:</Label>
                                                        <Input
                                                            type="number"
                                                            value={question.customMarks || question.marks}
                                                            onChange={(e) => updateQuestionMarks(question.id, parseInt(e.target.value) || 0)}
                                                            className="w-20 h-8 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeQuestion(question.id)}
                                                    className="text-red-500 hover:text-red-700"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Question Bank Modal */}
            <Dialog open={questionBankOpen} onOpenChange={setQuestionBankOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Question Bank</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Class</Label>
                                <Select value={selectedClass} onValueChange={setSelectedClass}>
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
                                <Label>Subject</Label>
                                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
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

                        <div className="space-y-2">
                            <Label>Search Questions</Label>
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by question text..."
                            />
                        </div>

                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                            {questions.map((question: any) => (
                                <Card key={question.id} className="p-4">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge>{question.marks} marks</Badge>
                                                <Badge variant="outline">{question.question_type}</Badge>
                                                <Badge variant="secondary">{question.difficulty}</Badge>
                                                {question.chapter && <Badge variant="outline">{question.chapter}</Badge>}
                                            </div>
                                            <p className="text-sm">{question.question_text}</p>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={() => addQuestionToPaper(question)}
                                            disabled={selectedQuestions.find(q => q.id === question.id)}
                                        >
                                            <Plus className="w-3 h-3 mr-1" />
                                            Add
                                        </Button>
                                    </div>
                                </Card>
                            ))}
                            {questions.length === 0 && (
                                <div className="text-center py-8 text-gray-400">
                                    No questions found. Try adjusting your search.
                                </div>
                            )}
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuestionBankOpen(false)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Preview Modal */}
            <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Paper Preview</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <div className="border-2 border-gray-200 rounded-lg p-8 bg-white">
                            <div className="text-center border-b-2 border-black pb-4 mb-6">
                                <h1 className="text-2xl font-bold">{paperTitle || 'Exam Paper'}</h1>
                                <p className="text-lg mt-2">Paper Code: {paperCode}</p>
                                <p className="text-sm mt-1">Max Marks: {calculateTotalMarks()} | Duration: {duration} minutes</p>
                            </div>

                            {generalInstructions && (
                                <div className="bg-gray-50 p-4 rounded mb-6">
                                    <h3 className="font-bold mb-2">General Instructions:</h3>
                                    <p className="text-sm whitespace-pre-wrap">{generalInstructions}</p>
                                </div>
                            )}

                            <div className="space-y-6">
                                {selectedQuestions.map((question, index) => (
                                    <div key={question.id} className="border-b pb-4">
                                        <p className="font-bold">
                                            {index + 1}. {question.question_text} [{question.customMarks || question.marks} marks]
                                        </p>
                                        {question.question_type === 'mcq' && question.options && (
                                            <div className="ml-8 mt-2 space-y-1">
                                                {Object.entries(JSON.parse(question.options)).map(([key, value]: [string, any]) => (
                                                    <p key={key} className="text-sm">{key}) {value}</p>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}