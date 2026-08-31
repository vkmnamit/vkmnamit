// Razorpay has been removed from the platform.
// This stub keeps old import references working while routing
// users to the manual/offline payment collection flow.

export async function openRazorpayCheckout(opts: {
    amount: number;
    orderId?: string;
    studentName?: string;
    description?: string;
    purpose?: string;
    callback?: (paymentId: string) => void;
    [key: string]: any;
}) {
    console.warn('[PAYMENT] Razorpay has been removed. Please collect payment manually.');
    // Trigger the manual collection callback if provided
    if (opts.callback) {
        opts.callback(`OFFLINE-${Date.now()}`);
    }
    return { success: false, message: 'Online payment is not available. Please use manual/offline fee collection.' };
}

export function getRazorpayKeyId(): string | null {
    return null;
}