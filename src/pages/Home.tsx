import { useQuery } from 'wasp/client/operations';
import { getDashboardData, claimDailyCheckin } from 'wasp/client/operations';
import { useState } from 'react';

export const HomePage = () => {
  const { data: dashboard, isLoading, error } = useQuery(getDashboardData);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinMessage, setCheckinMessage] = useState('');

  const handleDailyCheckin = async () => {
    try {
      setCheckinLoading(true);
      await claimDailyCheckin();
      setCheckinMessage('Daily bonus claimed! 🎉');
      setTimeout(() => setCheckinMessage(''), 3000);
    } catch (err: any) {
      setCheckinMessage(err.message || 'Failed to claim bonus');
      setTimeout(() => setCheckinMessage(''), 3000);
    } finally {
      setCheckinLoading(false);
    }
  };

  if (isLoading) return <div className="text-center py-8">Loading...</div>;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;
  if (!dashboard) return <div>No data available</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-8">
      {/* Wallet Balance Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Wallet Balance</h2>
        <p className="text-4xl font-semibold text-blue-600 mb-2">₦{dashboard.walletBalance.toLocaleString()}</p>
        <p className="text-gray-600 text-sm">Welcome Bonus: ₦{dashboard.welcomeBonus}</p>
      </div>

      {/* Daily Checkin Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Daily Check-in</h2>
        {checkinMessage && <p className="text-sm text-green-600 mb-2">{checkinMessage}</p>}
        <button
          onClick={handleDailyCheckin}
          disabled={!dashboard.isCheckinAvailable || checkinLoading}
          className={`w-full py-2 px-4 rounded font-semibold ${
            dashboard.isCheckinAvailable
              ? 'bg-green-500 hover:bg-green-600 text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {checkinLoading ? 'Claiming...' : 'Claim Bonus'}
        </button>
        {!dashboard.isCheckinAvailable && dashboard.nextCheckinAt && (
          <p className="text-xs text-gray-500 mt-2">
            Available at: {new Date(dashboard.nextCheckinAt).toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Total Returns Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Total Returns</h2>
        <p className="text-4xl font-semibold text-green-600">₦{dashboard.totalReturn.toLocaleString()}</p>
        <p className="text-gray-600 text-sm">From matured investments</p>
      </div>

      {/* Active Investments Card */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Active Investments ({dashboard.activeInvestments.length})</h2>
        {dashboard.activeInvestments.length > 0 ? (
          <ul className="space-y-2">
            {dashboard.activeInvestments.map((inv) => (
              <li key={inv.id} className="text-sm bg-gray-50 p-2 rounded">
                <p className="font-semibold">{inv.planName}</p>
                <p className="text-gray-600">₦{inv.amount} → ₦{inv.expectedPayout}</p>
                <p className="text-xs text-blue-600">{inv.daysLeft} days left</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500">No active investments yet</p>
        )}
      </div>
    </div>
  );
};

export default HomePage;