import { useQuery } from 'wasp/client/operations';
import { getProfileData } from 'wasp/client/operations';
import { updateBankDetails } from 'wasp/client/operations';
import { useState } from 'react';

export const ProfilePage = () => {
  const { data: profile, isLoading, error } = useQuery(getProfileData);
  const [bankForm, setBankForm] = useState({ accountName: '', accountNumber: '', bankName: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleBankUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await updateBankDetails(bankForm);
      setMessage('Bank details updated successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.message || 'Failed to update bank details');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) return <div className="text-center py-8">Loading profile...</div>;
  if (error) return <div className="text-red-500">Error: {error.message}</div>;
  if (!profile) return <div>No profile data</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8">
      {/* Profile Info */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Profile Information</h2>
        {message && <p className="text-green-600 mb-4">{message}</p>}
        <div className="space-y-4">
          <div>
            <p className="text-gray-600 text-sm">Full Name</p>
            <p className="text-lg font-semibold">{profile.fullName || 'Not set'}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Phone Number</p>
            <p className="text-lg font-semibold">{profile.phoneNumber || 'Not set'}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Referral Code</p>
            <p className="text-lg font-semibold font-mono">{profile.referralCode}</p>
          </div>
        </div>
      </div>

      {/* Referral Stats */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Referral Stats</h2>
        <div className="space-y-4">
          <div>
            <p className="text-gray-600 text-sm">Users Referred</p>
            <p className="text-3xl font-bold text-blue-600">{profile.totalReferredUsers}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Referral Earnings</p>
            <p className="text-3xl font-bold text-green-600">₦{profile.totalReferralEarnings.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Bank Details */}
      <div className="bg-white shadow rounded-lg p-6 md:col-span-2">
        <h2 className="text-2xl font-bold mb-4">Bank Details</h2>
        {profile.bank ? (
          <div className="space-y-2 mb-6">
            <p><strong>Account Name:</strong> {profile.bank.accountName}</p>
            <p><strong>Account Number:</strong> {profile.bank.accountNumber}</p>
            <p><strong>Bank Name:</strong> {profile.bank.bankName}</p>
          </div>
        ) : (
          <p className="text-gray-600 mb-6">No bank details added yet</p>
        )}
        <form onSubmit={handleBankUpdate} className="space-y-4">
          <input
            type="text"
            placeholder="Account Name"
            value={bankForm.accountName}
            onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
            className="w-full border rounded px-3 py-2"
            required
          />
          <input
            type="text"
            placeholder="Account Number"
            value={bankForm.accountNumber}
            onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
            className="w-full border rounded px-3 py-2"
            required
          />
          <input
            type="text"
            placeholder="Bank Name"
            value={bankForm.bankName}
            onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
            className="w-full border rounded px-3 py-2"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded font-semibold"
          >
            {loading ? 'Updating...' : 'Update Bank Details'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfilePage;