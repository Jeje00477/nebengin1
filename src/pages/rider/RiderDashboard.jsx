import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { pollRiderRequestStatus } from '../../services/api';
import BottomNav from '../../components/common/BottomNav';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import { MapPin, Navigation, Search } from 'lucide-react';

export default function RiderDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [activeRequest, setActiveRequest] = useState(null);

  const pickup = JSON.parse(sessionStorage.getItem('rider_pickup'));
  const destination = JSON.parse(sessionStorage.getItem('rider_destination')) || null;

  useEffect(() => {
    if (!sessionStorage.getItem('rider_destination')) {
      sessionStorage.setItem('rider_destination', JSON.stringify(destination));
    }

    // Check if there's an active request waiting
    async function checkStatus() {
      const { data } = await pollRiderRequestStatus();
      if (data && data.status === 'waiting') {
        setActiveRequest(data);
      } else if (data && data.status === 'matched') {
        navigate('/rider/trip/active');
      }
    }
    checkStatus();
  }, [navigate, destination]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20 flex flex-col">
      <div className="bg-green-600 px-6 py-6 rounded-b-3xl shadow-md">
        <div className="flex justify-between items-center mb-2">
          <div className="text-white">
            <p className="text-green-100 text-sm">Hai,</p>
            <h1 className="text-2xl font-bold">{user?.nama?.split(' ')[0] || 'Rider'}!</h1>
          </div>
          <button onClick={() => navigate('/rider/profile')}>
            <Avatar nama={user?.nama} src={user?.avatar_url} size="md" className="border-2 border-white" />
          </button>
        </div>
      </div>

      <div className="px-6 py-6 -mt-6 relative z-10 flex-1">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
          <h2 className="font-bold text-gray-900 mb-4 text-lg">Pesan Tumpangan</h2>
          
          <div className="space-y-3 relative">
            <div className="absolute left-6 top-8 bottom-8 w-0.5 border-l-2 border-dotted border-gray-300"></div>
            
            <button
              onClick={() => navigate('/rider/set-pickup')}
              className="w-full flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors text-left border border-transparent focus:border-green-100"
            >
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 z-10">
                <MapPin className="w-3.5 h-3.5 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-400 mb-0.5">Lokasi Jemputmu</p>
                <p className={`text-sm font-medium ${pickup ? 'text-gray-900' : 'text-gray-400'}`}>{pickup ? pickup.label : 'Ketuk untuk pilih lokasi'}</p>
              </div>
            </button>

            <button
              onClick={() => navigate('/rider/set-destination')}
              className="w-full flex items-center gap-4 p-3 hover:bg-gray-50 rounded-xl transition-colors text-left border border-transparent focus:border-green-100"
            >
              <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0 z-10">
                <Navigation className="w-3.5 h-3.5 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-400 mb-0.5">Tujuan</p>
                <p className="text-sm font-medium text-gray-900">{destination ? destination.label : 'Ketuk untuk pilih lokasi'}</p>
              </div>
            </button>
          </div>

          <div className="mt-6">
            <Button 
              label="Cari Tumpangan" 
              fullWidth 
              className="bg-green-600 hover:bg-green-700" 
              disabled={!pickup || !destination}
              onClick={() => navigate('/rider/waiting')}
            />
          </div>
        </div>

        {/* Status Section */}
        <div>
          <h3 className="font-semibold text-gray-900 mb-3 ml-1">Status Saat Ini</h3>
          {activeRequest ? (
            <div className="bg-white p-4 rounded-xl shadow-sm border border-green-200 bg-green-50/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center animate-pulse">
                  <Search className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-green-800 text-sm">Sedang mencari driver...</p>
                  <p className="text-xs text-green-600">Mohon tunggu sebentar</p>
                </div>
              </div>
              <Button label="Lihat" variant="ghost" className="text-sm text-green-700" onClick={() => navigate('/rider/waiting')} />
            </div>
          ) : (
            <div className="bg-white p-6 rounded-xl border border-gray-100 border-dashed flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                <MapPin className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium text-sm">Belum ada tumpangan aktif.</p>
            </div>
          )}
        </div>
      </div>

      <BottomNav role="rider" active="beranda" />
    </div>
  );
}
