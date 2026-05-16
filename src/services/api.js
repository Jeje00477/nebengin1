import { calculateDirectionScore } from '../utils/helpers.js';

// ─── LOCAL DB HELPER ─────────────────────────────────────────────────────────

const getDB = (key) => JSON.parse(localStorage.getItem(`db_${key}`)) || [];
const setDB = (key, data) => localStorage.setItem(`db_${key}`, JSON.stringify(data));

// Tables: users, driver_profiles, rider_requests, trips

// Mock delay to simulate network
const delay = (ms = 400) => new Promise(resolve => setTimeout(resolve, ms));

// ─── AUTH ────────────────────────────────────────────────────────────────────

export async function registerUser({ nama, email, password, role, nomor_wa }) {
  await delay();
  const users = getDB('users');
  
  if (users.find(u => u.email === email)) {
    return { data: null, error: 'Email sudah terdaftar' };
  }

  const newUser = { id: Date.now(), nama, email, password, role, nomor_wa, avatar_url: null };
  users.push(newUser);
  setDB('users', users);

  const { password: _, ...userWithoutPass } = newUser;
  return {
    data: { user: userWithoutPass, token: `mock_token_${newUser.id}` },
    error: null
  };
}

export async function loginUser({ email, password, role }) {
  await delay();
  const users = getDB('users');
  const user = users.find(u => u.email === email && u.password === password);

  if (!user) {
    return { data: null, error: 'Email atau password salah' };
  }
  if (user.role !== role) {
    return { data: null, error: `Akun ini tidak terdaftar sebagai ${role}` };
  }

  const { password: _, ...userWithoutPass } = user;
  return {
    data: { user: userWithoutPass, token: `mock_token_${user.id}` },
    error: null
  };
}

export async function logoutUser() {
  await delay(100);
  return { data: { success: true }, error: null };
}

export async function getMe() {
  await delay();
  const userStorage = localStorage.getItem('nebengin_user'); // from AuthContext
  if (!userStorage) return { data: null, error: 'Not authenticated' };
  
  const currentUser = JSON.parse(userStorage);
  const users = getDB('users');
  const user = users.find(u => u.id === currentUser.id);
  
  if (!user) return { data: null, error: 'User not found' };

  const { password, ...userWithoutPass } = user;
  return { data: userWithoutPass, error: null };
}

export async function updateProfile({ nama, avatar_url, nomor_wa }) {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const users = getDB('users');
  const index = users.findIndex(u => u.id === currentUser.id);

  if (index > -1) {
    users[index] = { ...users[index], nama, avatar_url, nomor_wa };
    setDB('users', users);
    const { password, ...userWithoutPass } = users[index];
    return { data: userWithoutPass, error: null };
  }
  return { data: null, error: 'Failed to update' };
}

// ─── DRIVER ──────────────────────────────────────────────────────────────────

export async function saveDriverVehicle(vehicleData) {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const profiles = getDB('driver_profiles');
  
  const existingIndex = profiles.findIndex(p => p.driver_id === currentUser.id);
  if (existingIndex > -1) {
    profiles[existingIndex].vehicle = vehicleData;
  } else {
    profiles.push({ driver_id: currentUser.id, is_available: true, vehicle: vehicleData, stats: { rating: 5.0, total_trips: 0 } });
  }
  setDB('driver_profiles', profiles);
  return { data: { success: true }, error: null };
}

export async function getDriverProfile() {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const profiles = getDB('driver_profiles');
  const profile = profiles.find(p => p.driver_id === currentUser.id);
  
  return { data: profile || null, error: null };
}

export async function toggleDriverAvailability() {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const profiles = getDB('driver_profiles');
  const index = profiles.findIndex(p => p.driver_id === currentUser.id);
  
  if (index > -1) {
    profiles[index].is_available = !profiles[index].is_available;
    setDB('driver_profiles', profiles);
  }
  return { data: { success: true }, error: null };
}

export async function searchRiders({ origin_lat, origin_lng, destination_lat, destination_lng }) {
  try {
    const requests = getDB('rider_requests').filter(r => r.status === 'waiting');
    const users = getDB('users');

    const driverOrigin  = { lat: origin_lat,      lng: origin_lng }
    const destination   = { lat: destination_lat, lng: destination_lng }

    const scoredRiders = await Promise.all(
      requests.map(async (req) => {
        const riderUser = users.find(u => u.id === req.rider_id);
        const riderPickup = { lat: req.pickup_lat, lng: req.pickup_lng };
        const scoreData   = await calculateDirectionScore(driverOrigin, riderPickup, destination);

        // Fallback to strict distance limit if OSRM fails
        let score = 0, detour_meters = 0, detour_seconds = 0;
        if (scoreData) {
          score = scoreData.score;
          detour_meters = scoreData.detour_meters;
          detour_seconds = scoreData.detour_seconds;
        }

        return { 
          id: req.id, 
          rider_id: req.rider_id,
          nama: riderUser?.nama || 'Unknown', 
          avatar_url: riderUser?.avatar_url,
          lokasi_jemput_label: req.lokasi_jemput_label,
          tujuan_label: req.tujuan_label,
          pickup_lat: req.pickup_lat,
          pickup_lng: req.pickup_lng,
          direction_score: score, 
          detour_meters, 
          detour_seconds, 
          rating: 5.0 // Base rating for new DB
        };
      })
    );

    const filtered = scoredRiders
      .filter(r => r.direction_score >= 0.60 || !r.direction_score) // show all if OSRM fails, else filter
      .sort((a, b) => b.direction_score - a.direction_score);

    return { data: filtered, error: null };

  } catch (err) {
    return { data: null, error: err.message };
  }
}

export async function confirmPickup({ riderRequestIds }) {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const requests = getDB('rider_requests');
  const reqId = riderRequestIds[0]; // Take first
  
  const index = requests.findIndex(r => r.id === reqId);
  if (index > -1) {
    requests[index].status = 'matched';
    requests[index].driver_id = currentUser.id;
    setDB('rider_requests', requests);
    
    // Create Trip
    const trips = getDB('trips');
    const newTrip = {
      id: Date.now(),
      request_id: reqId,
      driver_id: currentUser.id,
      rider_id: requests[index].rider_id,
      status: 'on_the_way',
      date: new Date().toISOString(),
      route_label: `${requests[index].lokasi_jemput_label} → ${requests[index].tujuan_label}`
    };
    trips.push(newTrip);
    setDB('trips', trips);

    return { data: { tripId: newTrip.id }, error: null };
  }
  return { data: null, error: 'Request not found' };
}

export async function markRiderPickedUp({ tripId }) {
  await delay();
  const trips = getDB('trips');
  const index = trips.findIndex(t => t.id === tripId);
  if (index > -1) {
    trips[index].status = 'picked_up';
    setDB('trips', trips);
    return { data: { success: true }, error: null };
  }
  return { data: null, error: 'Trip not found' };
}

export async function completeTrip({ tripId }) {
  await delay();
  const trips = getDB('trips');
  const index = trips.findIndex(t => t.id === tripId);
  if (index > -1) {
    trips[index].status = 'selesai';
    setDB('trips', trips);
    return { data: { success: true }, error: null };
  }
  return { data: null, error: 'Trip not found' };
}

export async function getDriverHistory() {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const trips = getDB('trips').filter(t => t.driver_id === currentUser.id && t.status === 'selesai');
  return { data: trips.reverse(), error: null };
}

export async function getDriverTripDetail({ tripId }) {
  await delay();
  const trips = getDB('trips');
  const users = getDB('users');
  const trip = trips.find(t => t.id === tripId);
  
  if (trip) {
    const rider = users.find(u => u.id === trip.rider_id);
    return {
      data: {
        ...trip,
        riders: [{ id: rider.id, nama: rider.nama, status: trip.status, rating_received: trip.rating_received || 0 }]
      },
      error: null
    };
  }
  return { data: null, error: 'Trip not found' };
}

// ─── RIDER ───────────────────────────────────────────────────────────────────

export async function createRiderRequest({ pickup_lat, pickup_lng, lokasi_jemput_label, destination_lat, destination_lng, tujuan_label }) {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const requests = getDB('rider_requests');
  
  // Cancel previous active ones
  requests.forEach(r => {
    if (r.rider_id === currentUser.id && r.status === 'waiting') r.status = 'cancelled';
  });

  const newRequest = {
    id: Date.now(),
    rider_id: currentUser.id,
    pickup_lat, pickup_lng, lokasi_jemput_label,
    destination_lat, destination_lng, tujuan_label,
    status: 'waiting',
    created_at: new Date().toISOString()
  };
  
  requests.push(newRequest);
  setDB('rider_requests', requests);
  return { data: { requestId: newRequest.id }, error: null };
}

export async function pollRiderRequestStatus() {
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  if (!currentUser) return { data: null, error: null };

  const requests = getDB('rider_requests');
  const activeReq = requests.find(r => r.rider_id === currentUser.id && (r.status === 'waiting' || r.status === 'matched'));

  if (!activeReq) {
    return { data: null, error: null };
  }

  if (activeReq.status === 'waiting') {
    return {
      data: { status: 'waiting', driver: null, match_id: null },
      error: null
    };
  }

  if (activeReq.status === 'matched') {
    const users = getDB('users');
    const profiles = getDB('driver_profiles');
    const driver = users.find(u => u.id === activeReq.driver_id);
    const profile = profiles.find(p => p.driver_id === activeReq.driver_id);

    return {
      data: {
        status: 'matched',
        match_id: activeReq.id,
        cancel_deadline: new Date(Date.now() + 60000).toISOString(),
        driver: {
          id: driver.id,
          nama: driver.nama,
          avatar_url: driver.avatar_url,
          rating: profile?.stats?.rating || 5.0,
          nomor_wa: driver.nomor_wa,
          vehicle: profile?.vehicle || null
        }
      },
      error: null
    };
  }
}

export async function cancelRiderRequest({ requestId }) {
  await delay();
  const requests = getDB('rider_requests');
  const index = requests.findIndex(r => r.id === requestId);
  if (index > -1) {
    requests[index].status = 'cancelled';
    setDB('rider_requests', requests);
  }
  return { data: { success: true }, error: null };
}

export async function cancelMatchByRider({ matchId }) {
  return cancelRiderRequest({ requestId: matchId });
}

export async function getRiderActiveTrip() {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const trips = getDB('trips').filter(t => t.rider_id === currentUser.id && (t.status === 'on_the_way' || t.status === 'picked_up'));
  
  if (trips.length > 0) {
    const trip = trips[0];
    const users = getDB('users');
    const profiles = getDB('driver_profiles');
    const driver = users.find(u => u.id === trip.driver_id);
    const profile = profiles.find(p => p.driver_id === trip.driver_id);

    return {
      data: {
        id: trip.id,
        status: trip.status,
        driver: {
          id: driver.id,
          nama: driver.nama,
          avatar_url: driver.avatar_url,
          nomor_wa: driver.nomor_wa,
          vehicle: profile?.vehicle
        }
      },
      error: null
    };
  }
  return { data: null, error: 'No active trip' };
}

export async function completeRiderTrip({ tripId }) {
  return completeTrip({ tripId });
}

export async function getRiderHistory() {
  await delay();
  const currentUser = JSON.parse(localStorage.getItem('nebengin_user'));
  const trips = getDB('trips').filter(t => t.rider_id === currentUser.id && t.status === 'selesai');
  
  const users = getDB('users');
  const enrichedTrips = trips.map(t => {
    const driver = users.find(u => u.id === t.driver_id);
    return { ...t, driver_name: driver?.nama };
  });

  return { data: enrichedTrips.reverse(), error: null };
}

export async function getRiderTripDetail({ tripId }) {
  await delay();
  const trips = getDB('trips');
  const users = getDB('users');
  const trip = trips.find(t => t.id === tripId);
  
  if (trip) {
    const driver = users.find(u => u.id === trip.driver_id);
    return {
      data: {
        ...trip,
        driver: { nama: driver?.nama, rating_given: trip.rating_given || 0 }
      },
      error: null
    };
  }
  return { data: null, error: 'Trip not found' };
}

export async function submitRating({ tripId, nilai, komentar, arah_rating }) {
  await delay();
  const trips = getDB('trips');
  const index = trips.findIndex(t => t.id === tripId);
  if (index > -1) {
    if (arah_rating === 'rider_to_driver') trips[index].rating_given = nilai;
    if (arah_rating === 'driver_to_rider') trips[index].rating_received = nilai;
    setDB('trips', trips);
  }
  return { data: { success: true }, error: null };
}
