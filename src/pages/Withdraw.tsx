import { useState } from 'react';
import { requestWithdrawal } from 'wasp/client/operations';

export const WithdrawPage = () => {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) {
      setMessage('Please enter an amount');
      return;
    }
    try {
      setLoading(true);
      await requestWithdrawal({ amount: Number(amount), method });
      setSuccess(true);
      setMessage('Withdrawal request submitted! Pending admin approval.');
      setAmount('');
    } catch (err: any) {
      setSuccess(false);
      setMessage(err.message || 'Withdrawal request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Request Withdrawal</h1>
      {message && (
        <div className={`p-4 rounded mb-6 ${
          success
            ? 'bg-green-50 border border-green-200 text-green-800'
            : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {message}
        </div>
      )}

      <form onSubmit={handleWithdraw} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Amount */}
        <div>
          <label className="block text-sm font-semibold mb-2">Withdrawal Amount (₦)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter withdrawal amount"
            className="w-full border rounded px-3 py-2"
            required
          />
          <p className="text-xs text-gray-600 mt-1">* Welcome bonus cannot be withdrawn</p>
        </div>

        {/* Method */}
        <div>
          <label className="block text-sm font-semibold mb-2">Withdrawal Method</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            <option value="bank">Bank Transfer</option>
            <option value="wallet">Mobile Wallet</option>
          </select>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 p-4 rounded">
          <h3 className="font-semibold text-blue-900 mb-2">Important Notes:</h3>
          <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
            <li>Withdrawals are processed after admin approval</li>
            <li>Minimum withdrawal: ₦1,000</li>
            <li>Active investments must be completed before full withdrawal</li>
          </ul>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-semibold"
        >
          {loading ? 'Processing...' : 'Request Withdrawal'}
        </button>
      </form>
    </div>
  );
};

export default WithdrawPage;