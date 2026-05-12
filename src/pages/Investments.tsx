import { useQuery } from 'wasp/client/operations';
import { getInvestmentPlans } from 'wasp/client/operations';
import { useState } from 'react';
import { createInvestment } from 'wasp/client/operations';

export const InvestmentsPage = () => {
  const { data: plansData, isLoading, error } = useQuery(getInvestmentPlans);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleInvest = async () => {
    if (!selectedPlanId || !amount) {
      setMessage('Please select a plan and enter an amount');
      return;
    }
    try {
      setLoading(true);
      await createInvestment({ planId: selectedPlanId, amount: Number(amount) });
      setMessage('Investment created successfully!');
      setAmount('');
      setSelectedPlanId(null);
    } catch (err: any) {
      setMessage(err.message || 'Investment failed');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <div className="text-center py-8">Loading investment plans...</div>;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;

  const plans = plansData?.items || [];

  return (
    <div className="py-8">
      <h1 className="text-3xl font-bold mb-8">Investment Plans</h1>
      {message && <div className="bg-blue-50 p-4 rounded mb-4 text-blue-800">{message}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`border-2 rounded-lg p-6 cursor-pointer transition ${
              selectedPlanId === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
            }`}
            onClick={() => setSelectedPlanId(plan.id)}
          >
            {plan.imageUrl && <img src={plan.imageUrl} alt={plan.name} className="w-full h-40 object-cover rounded mb-4" />}
            <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
            <p className="text-sm text-gray-600 mb-3">{plan.carName}</p>
            <div className="space-y-1 text-sm">
              <p><strong>ROI:</strong> {plan.roiPercent}%</p>
              <p><strong>Duration:</strong> {plan.durationDays} days</p>
              <p><strong>Min:</strong> ₦{plan.minAmount}</p>
              <p><strong>Max:</strong> ₦{plan.maxAmount}</p>
            </div>
          </div>
        ))}
      </div>

      {selectedPlanId && (
        <div className="bg-white shadow rounded-lg p-6 max-w-md">
          <h2 className="text-2xl font-bold mb-4">Enter Amount</h2>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter investment amount"
            className="w-full border rounded px-3 py-2 mb-4"
          />
          <button
            onClick={handleInvest}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-semibold"
          >
            {loading ? 'Investing...' : 'Invest Now'}
          </button>
        </div>
      )}
    </div>
  );
};

export default InvestmentsPage;