import { useState } from 'react';
import { useQuery } from 'wasp/client/operations';
import { getDepositMethods, requestDeposit } from 'wasp/client/operations';

export const DepositPage = () => {
  const { data: methods, isLoading, error } = useQuery(getDepositMethods);
  const [selectedMethod, setSelectedMethod] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [proofUrl, setProofUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMethod || !amount) {
      setMessage('Please select a method and enter an amount');
      return;
    }
    try {
      setLoading(true);
      await requestDeposit({
        method: selectedMethod,
        amount: Number(amount),
        proofUrl: proofUrl || null,
      });
      setMessage('Deposit request submitted! Waiting for admin approval.');
      setAmount('');
      setProofUrl('');
      setSelectedMethod('');
    } catch (err: any) {
      setMessage(err.message || 'Deposit request failed');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <div className="text-center py-8">Loading deposit methods...</div>;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-3xl font-bold mb-8">Request Deposit</h1>
      {message && <div className="bg-blue-50 border border-blue-200 p-4 rounded mb-6 text-blue-800">{message}</div>}

      <form onSubmit={handleDeposit} className="bg-white shadow rounded-lg p-6 space-y-6">
        {/* Deposit Methods */}
        <div>
          <h2 className="text-xl font-bold mb-4">Select Deposit Method</h2>
          <div className="space-y-3">
            {methods?.selar && methods.selar.isEnabled && (
              <label className="flex items-center p-4 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="method"
                  value="selar"
                  checked={selectedMethod === 'selar'}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                />
                <span className="ml-3 font-semibold">Selar</span>
              </label>
            )}
            {methods?.direct_bank && methods.direct_bank.isEnabled && (
              <label className="flex items-center p-4 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="method"
                  value="direct_bank"
                  checked={selectedMethod === 'direct_bank'}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                />
                <span className="ml-3 font-semibold">Direct Bank Transfer</span>
              </label>
            )}
            {methods?.crypto && methods.crypto.isEnabled && (
              <label className="flex items-center p-4 border rounded cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="method"
                  value="crypto"
                  checked={selectedMethod === 'crypto'}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                />
                <span className="ml-3 font-semibold">Cryptocurrency</span>
              </label>
            )}
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-semibold mb-2">Amount (₦)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount"
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>

        {/* Proof URL */}
        <div>
          <label className="block text-sm font-semibold mb-2">Proof/Transaction Hash (Optional)</label>
          <input
            type="text"
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
            placeholder="Transaction ID or proof URL"
            className="w-full border rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded font-semibold"
        >
          {loading ? 'Processing...' : 'Request Deposit'}
        </button>
      </form>
    </div>
  );
};

export default DepositPage;