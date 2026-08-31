import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, X, Download } from 'lucide-react';
import { Button } from '../ui/button';
import confetti from 'canvas-confetti';
import { generateProfessionalReceipt } from '../../../lib/pdf';

interface PaymentSuccessOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  amount: number;
  receiptNumber: string;
  studentName?: string;
  admissionNumber?: string;
  rollNumber?: string;
  classSection?: string;
  feeTitle?: string;
  schoolName?: string;
  schoolAddress?: string;
  schoolPhone?: string;
  schoolEmail?: string;
  balanceRemaining?: number;
  paymentMethod?: string;
  items?: { title: string; dueAmount: number; paidAmount: number; balance: number }[];
  globalBalance?: number;
  grandTotalDue?: number;
  grandTotalPaid?: number;
  grandBalance?: number;
}

export function PaymentSuccessOverlay({
  isOpen, onClose, amount, receiptNumber,
  studentName = 'Student', admissionNumber = 'N/A',
  rollNumber,
  classSection = 'N/A', feeTitle = 'Fee Payment',
  schoolName = 'School Management System', schoolAddress,
  schoolPhone, schoolEmail,
  balanceRemaining = 0,
  paymentMethod = 'Online Payment',
  items,
  globalBalance,
  grandTotalDue,
  grandTotalPaid,
  grandBalance,
}: PaymentSuccessOverlayProps) {
  React.useEffect(() => {
    if (isOpen) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#10b981', '#3b82f6']
      });
    }
  }, [isOpen]);

  const handleDownload = () => {
    generateProfessionalReceipt({
      schoolName,
      schoolAddress,
      schoolPhone,
      schoolEmail,
      receiptNumber: receiptNumber,
      date: new Date().toLocaleDateString(),
      studentName,
      admissionNumber,
      rollNumber,
      classSection,
      feeTitle,
      amount: items ? items.reduce((sum, i) => sum + Number(i.paidAmount), 0) : amount,
      balanceRemaining,
      paymentMethod: paymentMethod,
      transactionId: receiptNumber,
      items,
      globalBalance,
      grandTotalDue,
      grandTotalPaid,
      grandBalance
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden relative"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="p-8 text-center">
              <div className="mb-6 flex justify-center">
                <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500" />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Confirmed!</h2>
              <p className="text-slate-500 mb-8">
                Your transaction has been processed successfully. A receipt has been sent to your registered email.
              </p>

              <div className="bg-slate-50 rounded-2xl p-6 mb-8 text-left space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-500">Amount Paid</span>
                  <span className="text-lg font-bold text-slate-900">₹{amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-500">Receipt No.</span>
                  <span className="text-sm font-mono font-bold text-blue-600 uppercase tracking-wider">
                    {receiptNumber}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-500">Status</span>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold uppercase rounded-full">
                    Success
                  </span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-200 pt-3">
                  <span className="text-sm font-medium text-slate-500">Balance Remaining</span>
                  <span className={`text-lg font-bold ${(grandBalance ?? balanceRemaining) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    ₹{(grandBalance ?? balanceRemaining).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  className="w-1/2 h-12 rounded-xl font-bold border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Save PDF
                </Button>
                <Button
                  onClick={onClose}
                  className="w-1/2 bg-blue-600 hover:bg-blue-700 h-12 rounded-xl font-bold shadow-lg shadow-blue-600/20"
                >
                  Return
                </Button>
              </div>
            </div>

            <div className="bg-blue-600 h-2 w-full" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
