import { Component, ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    componentDidCatch(error: Error, errorInfo: any) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({ errorInfo: errorInfo.componentStack || 'No stack trace available' });
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-screen flex items-center justify-center p-6">
                    <Card className="max-w-2xl w-full">
                        <CardHeader>
                            <CardTitle className="text-red-600">Something went wrong</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <p className="font-semibold text-gray-700">Error:</p>
                                <p className="text-sm text-gray-600 mt-1">{this.state.error?.message || 'Unknown error'}</p>
                            </div>
                            {this.state.errorInfo && (
                                <div>
                                    <p className="font-semibold text-gray-700">Stack Trace:</p>
                                    <pre className="text-xs text-gray-500 mt-1 overflow-auto max-h-40 bg-gray-50 p-2 rounded">
                                        {this.state.errorInfo}
                                    </pre>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <Button onClick={() => window.location.reload()}>
                                    Reload Page
                                </Button>
                                <Button variant="outline" onClick={() => window.location.href = '/dashboard'}>
                                    Go to Dashboard
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}