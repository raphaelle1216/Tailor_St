import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import './TailorSt.css';

const demoUniforms = [
  {
    id: 'blazer-1',
    title: 'Navy school blazer',
    category: 'Blazer',
    size: 'Youth M',
    condition: 'Gently used',
    notes: 'Freshly cleaned, small mark near cuff.',
    image_url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=900&q=80',
    status: 'available',
  },
  {
    id: 'shirt-1',
    title: 'White uniform shirts',
    category: 'Shirts',
    size: 'Adult S',
    condition: 'Like new',
    notes: 'Set of two short-sleeve shirts.',
    image_url: 'https://images.unsplash.com/photo-1620012253295-c15cc3e65df4?auto=format&fit=crop&w=900&q=80',
    status: 'available',
  },
  {
    id: 'pants-1',
    title: 'Khaki uniform pants',
    category: 'Pants',
    size: '30 waist',
    condition: 'Good',
    notes: 'Hemmed for a shorter inseam.',
    image_url: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80',
    status: 'available',
  },
];

const demoSlots = [
  { id: 'slot-1', label: 'Tuesday, 3:30 PM - 4:00 PM', capacity: 3, booked_count: 0, is_active: true },
  { id: 'slot-2', label: 'Wednesday, 8:00 AM - 8:30 AM', capacity: 2, booked_count: 0, is_active: true },
  { id: 'slot-3', label: 'Friday, 2:45 PM - 3:15 PM', capacity: 2, booked_count: 0, is_active: true },
];

const emptyItem = {
  title: '',
  category: 'Shirts',
  size: '',
  condition: 'Gently used',
  notes: '',
  image_url: '',
  status: 'available',
};

function formatSlotLabel(dateValue, startValue, endValue) {
  const date = new Date(`${dateValue}T${startValue}`);
  const day = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
  const start = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  const end = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(`${dateValue}T${endValue}`));

  return `${day}, ${start} - ${end}`;
}

function makePickupCode() {
  return `TS-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function TailorSt() {
  const [view, setView] = useState('shop');
  const [uniforms, setUniforms] = useState(demoUniforms);
  const [slots, setSlots] = useState(demoSlots);
  const [bookings, setBookings] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [studentNote, setStudentNote] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminCredentials, setAdminCredentials] = useState({ email: '', password: '' });
  const [newItem, setNewItem] = useState(emptyItem);
  const [photoFile, setPhotoFile] = useState(null);
  const [newSlot, setNewSlot] = useState({ date: '', startTime: '', endTime: '', capacity: 1 });
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const availableUniforms = useMemo(
    () => uniforms.filter((item) => item.status === 'available'),
    [uniforms]
  );

  const activeSlots = useMemo(
    () => slots.filter((slot) => slot.is_active && Number(slot.booked_count) < Number(slot.capacity)),
    [slots]
  );

  useEffect(() => {
    if (!hasSupabaseConfig) return;

    async function loadLiveData() {
      setIsLoading(true);
      const [uniformResult, slotResult] = await Promise.all([
        supabase.from('uniforms').select('*').eq('status', 'available').order('created_at', { ascending: false }),
        supabase.from('pickup_slots').select('*').eq('is_active', true).order('starts_at', { ascending: true }),
      ]);

      if (!uniformResult.error && uniformResult.data) setUniforms(uniformResult.data);
      if (!slotResult.error && slotResult.data) setSlots(slotResult.data);
      if (uniformResult.error || slotResult.error) {
        setStatusMessage('Supabase is connected, but one or more tables need setup.');
      }
      setIsLoading(false);
    }

    async function restoreAdminSession() {
      const sessionResult = await supabase.auth.getSession();
      if (!sessionResult.data.session) return;

      setAdminUnlocked(true);
      const [uniformResult, slotResult, bookingResult] = await Promise.all([
        supabase.from('uniforms').select('*').order('created_at', { ascending: false }),
        supabase.from('pickup_slots').select('*').order('starts_at', { ascending: true }),
        supabase.from('bookings').select('*, uniforms(title, size), pickup_slots(label)').order('created_at', { ascending: false }),
      ]);

      if (!uniformResult.error && uniformResult.data) setUniforms(uniformResult.data);
      if (!slotResult.error && slotResult.data) setSlots(slotResult.data);
      if (!bookingResult.error && bookingResult.data) setBookings(bookingResult.data);
    }

    loadLiveData();
    restoreAdminSession();

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAdminUnlocked(Boolean(session));
    });

    return () => data.subscription.unsubscribe();
  }, []);

  async function reserveItem(event) {
    event.preventDefault();
    if (!selectedItem || !selectedSlot) return;

    const slot = slots.find((entry) => entry.id === selectedSlot);
    const pickupCode = makePickupCode();
    const booking = {
      uniform_id: selectedItem.id,
      slot_id: selectedSlot,
      pickup_code: pickupCode,
      student_note: studentNote.trim(),
      status: 'reserved',
    };

    setIsLoading(true);

    if (hasSupabaseConfig) {
      const bookingResult = await supabase.rpc('reserve_uniform', {
        requested_uniform_id: selectedItem.id,
        requested_slot_id: selectedSlot,
        requested_pickup_code: pickupCode,
        requested_student_note: studentNote.trim(),
      });
      if (bookingResult.error) {
        setStatusMessage('This item could not be reserved. Please try another item or time.');
        setIsLoading(false);
        return;
      }
    }

    setUniforms((items) =>
      items.map((item) => (item.id === selectedItem.id ? { ...item, status: 'reserved' } : item))
    );
    setSlots((entries) =>
      entries.map((entry) =>
        entry.id === selectedSlot ? { ...entry, booked_count: Number(entry.booked_count) + 1 } : entry
      )
    );
    setBookings((entries) => [
      {
        ...booking,
        id: `${selectedItem.id}-${Date.now()}`,
        uniforms: { title: selectedItem.title, size: selectedItem.size },
        pickup_slots: { label: slot.label },
      },
      ...entries,
    ]);
    setConfirmation({ item: selectedItem.title, slot: slot.label, pickupCode });
    setSelectedItem(null);
    setSelectedSlot('');
    setStudentNote('');
    setIsLoading(false);
  }

  async function loadAdminData() {
    if (!hasSupabaseConfig) return;

    const [uniformResult, slotResult, bookingResult] = await Promise.all([
      supabase.from('uniforms').select('*').order('created_at', { ascending: false }),
      supabase.from('pickup_slots').select('*').order('starts_at', { ascending: true }),
      supabase.from('bookings').select('*, uniforms(title, size), pickup_slots(label)').order('created_at', { ascending: false }),
    ]);

    if (!uniformResult.error && uniformResult.data) setUniforms(uniformResult.data);
    if (!slotResult.error && slotResult.data) setSlots(slotResult.data);
    if (!bookingResult.error && bookingResult.data) setBookings(bookingResult.data);
    if (uniformResult.error || slotResult.error || bookingResult.error) {
      setStatusMessage('Admin data could not load yet. Check Supabase Auth and table policies.');
    }
  }

  async function unlockAdmin(event) {
    event.preventDefault();
    if (hasSupabaseConfig) {
      setIsLoading(true);
      const result = await supabase.auth.signInWithPassword(adminCredentials);
      if (result.error) {
        setStatusMessage('That admin login did not work.');
        setIsLoading(false);
        return;
      }
      setAdminUnlocked(true);
      setStatusMessage('');
      await loadAdminData();
      setIsLoading(false);
      return;
    }

    const expected = process.env.REACT_APP_ADMIN_PASSCODE || 'tailorst-admin';
    if (adminCredentials.password !== expected) {
      setStatusMessage('That admin passcode did not work.');
      return;
    }
    setAdminUnlocked(true);
    setStatusMessage('');
  }

  async function addItem(event) {
    event.preventDefault();
    const item = { ...newItem, title: newItem.title.trim(), size: newItem.size.trim(), notes: newItem.notes.trim() };
    if (!item.title || !item.size) return;

    setIsLoading(true);
    if (hasSupabaseConfig) {
      let imageUrl = item.image_url;
      if (photoFile) {
        const safeName = photoFile.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
        const filePath = `${Date.now()}-${safeName}`;
        const uploadResult = await supabase.storage.from('uniform-photos').upload(filePath, photoFile);

        if (uploadResult.error) {
          setStatusMessage('The photo could not be uploaded yet. Check the Supabase storage bucket.');
          setIsLoading(false);
          return;
        }

        imageUrl = supabase.storage.from('uniform-photos').getPublicUrl(filePath).data.publicUrl;
      }

      const result = await supabase.from('uniforms').insert({ ...item, image_url: imageUrl }).select().single();
      if (result.error) {
        setStatusMessage('The item could not be added yet. Check the Supabase table setup.');
        setIsLoading(false);
        return;
      }
      setUniforms((items) => [result.data, ...items]);
    } else {
      setUniforms((items) => [{ ...item, id: `item-${Date.now()}` }, ...items]);
    }
    setNewItem(emptyItem);
    setPhotoFile(null);
    setStatusMessage('Item added.');
    setIsLoading(false);
  }

  async function addSlot(event) {
    event.preventDefault();
    if (!newSlot.date || !newSlot.startTime || !newSlot.endTime) return;

    const startsAt = new Date(`${newSlot.date}T${newSlot.startTime}`).toISOString();
    const slot = {
      label: formatSlotLabel(newSlot.date, newSlot.startTime, newSlot.endTime),
      starts_at: startsAt,
      capacity: Number(newSlot.capacity),
      booked_count: 0,
      is_active: true,
    };
    if (slot.capacity < 1) return;

    setIsLoading(true);
    if (hasSupabaseConfig) {
      const result = await supabase.from('pickup_slots').insert(slot).select().single();
      if (result.error) {
        setStatusMessage('The pickup slot could not be added yet. Check the Supabase table setup.');
        setIsLoading(false);
        return;
      }
      setSlots((entries) => [result.data, ...entries]);
    } else {
      setSlots((entries) => [{ ...slot, id: `slot-${Date.now()}` }, ...entries]);
    }
    setNewSlot({ date: '', startTime: '', endTime: '', capacity: 1 });
    setStatusMessage('Pickup slot added.');
    setIsLoading(false);
  }

  async function signOutAdmin() {
    if (hasSupabaseConfig) {
      await supabase.auth.signOut();
    }
    setAdminUnlocked(false);
    setBookings([]);
    setStatusMessage('');
  }

  async function completeBooking(booking) {
    setIsLoading(true);
    if (hasSupabaseConfig) {
      await supabase.from('bookings').update({ status: 'completed' }).eq('id', booking.id);
      await supabase.from('uniforms').update({ status: 'completed' }).eq('id', booking.uniform_id);
    }
    setBookings((entries) =>
      entries.map((entry) => (entry.id === booking.id ? { ...entry, status: 'completed' } : entry))
    );
    setUniforms((items) =>
      items.map((item) => (item.id === booking.uniform_id ? { ...item, status: 'completed' } : item))
    );
    setIsLoading(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => setView('shop')} type="button">
          <span className="brand-mark">TS</span>
          <span>
            <strong>Tailor St</strong>
            <small>Uniforms, shared with care</small>
          </span>
        </button>
        <nav className="nav-actions" aria-label="Primary">
          <button className={view === 'shop' ? 'active' : ''} onClick={() => setView('shop')} type="button">
            Browse
          </button>
          <button className={view === 'admin' ? 'active' : ''} onClick={() => setView('admin')} type="button">
            Admin
          </button>
        </nav>
      </header>

      {statusMessage && <p className="status-message">{statusMessage}</p>}

      {view === 'shop' ? (
        <>
          <section className="hero-section">
            <div>
              <p className="eyebrow">No cost. Private pickup. School-ready.</p>
              <h1>Find the uniform pieces you need without the stress.</h1>
              <p>
                Browse donated uniforms, reserve what fits, and choose a pickup time. No payment is needed.
              </p>
            </div>
            <div className="hero-panel">
              <strong>{availableUniforms.length}</strong>
              <span>available pieces</span>
            </div>
          </section>

          {confirmation && (
            <section className="confirmation">
              <div>
                <strong>Reservation saved</strong>
                <p>
                  Pickup code <b>{confirmation.pickupCode}</b> for {confirmation.item} at {confirmation.slot}.
                </p>
              </div>
              <button onClick={() => setConfirmation(null)} type="button">Done</button>
            </section>
          )}

          <section className="inventory-grid" aria-label="Available uniforms">
            {availableUniforms.map((item) => (
              <article className="uniform-card" key={item.id}>
                <img src={item.image_url || 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80'} alt="" />
                <div className="uniform-card-body">
                  <div className="card-heading">
                    <h2>{item.title}</h2>
                    <span>{item.size}</span>
                  </div>
                  <p>{item.category} · {item.condition}</p>
                  <p className="muted">{item.notes}</p>
                  <button onClick={() => setSelectedItem(item)} type="button">Reserve</button>
                </div>
              </article>
            ))}
          </section>

          {availableUniforms.length === 0 && (
            <section className="empty-state">
              <h2>No uniforms are available right now.</h2>
              <p>Check back soon, or ask the program organizer about upcoming donations.</p>
            </section>
          )}
        </>
      ) : (
        <AdminView
          addItem={addItem}
          addSlot={addSlot}
          adminCredentials={adminCredentials}
          adminUnlocked={adminUnlocked}
          bookings={bookings}
          completeBooking={completeBooking}
          isLoading={isLoading}
          newItem={newItem}
          newSlot={newSlot}
          photoFile={photoFile}
          setAdminCredentials={setAdminCredentials}
          setNewItem={setNewItem}
          setNewSlot={setNewSlot}
          setPhotoFile={setPhotoFile}
          signOutAdmin={signOutAdmin}
          slots={slots}
          uniforms={uniforms}
          unlockAdmin={unlockAdmin}
        />
      )}

      {selectedItem && (
        <div className="modal-backdrop" role="presentation">
          <section className="reservation-modal" role="dialog" aria-modal="true" aria-label="Reserve uniform">
            <button className="close-button" onClick={() => setSelectedItem(null)} type="button">x</button>
            <img src={selectedItem.image_url} alt="" />
            <form onSubmit={reserveItem}>
              <p className="eyebrow">Reserve anonymously</p>
              <h2>{selectedItem.title}</h2>
              <p className="muted">{selectedItem.size} · {selectedItem.condition}</p>
              <label>
                Pickup time
                <select value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)} required>
                  <option value="">Choose a time</option>
                  {activeSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label} ({Number(slot.capacity) - Number(slot.booked_count)} open)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Optional note
                <textarea
                  value={studentNote}
                  onChange={(event) => setStudentNote(event.target.value)}
                  placeholder="Example: I can pick this up after dismissal."
                />
              </label>
              <button disabled={isLoading || activeSlots.length === 0} type="submit">
                {isLoading ? 'Saving...' : 'Book pickup'}
              </button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function AdminView({
  addItem,
  addSlot,
  adminCredentials,
  adminUnlocked,
  bookings,
  completeBooking,
  isLoading,
  newItem,
  newSlot,
  photoFile,
  setAdminCredentials,
  setNewItem,
  setNewSlot,
  setPhotoFile,
  signOutAdmin,
  slots,
  uniforms,
  unlockAdmin,
}) {
  if (!adminUnlocked) {
    return (
      <section className="admin-login">
        <form onSubmit={unlockAdmin}>
          <p className="eyebrow">Admin portal</p>
          <h1>Manage inventory, pickup slots, and reservations.</h1>
          {hasSupabaseConfig && (
            <label>
              Email
              <input
                type="email"
                value={adminCredentials.email}
                onChange={(event) => setAdminCredentials({ ...adminCredentials, email: event.target.value })}
                placeholder="admin@example.com"
              />
            </label>
          )}
          <label>
            {hasSupabaseConfig ? 'Password' : 'Passcode'}
            <input
              type="password"
              value={adminCredentials.password}
              onChange={(event) => setAdminCredentials({ ...adminCredentials, password: event.target.value })}
              placeholder={hasSupabaseConfig ? 'Enter admin password' : 'Enter admin passcode'}
            />
          </label>
          <button disabled={isLoading} type="submit">{isLoading ? 'Opening...' : 'Open admin'}</button>
        </form>
      </section>
    );
  }

  return (
    <section className="admin-grid">
      <div className="admin-panel wide">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Orders</p>
            <h2>Reservations</h2>
          </div>
          <div className="panel-actions">
            <strong>{bookings.filter((booking) => booking.status === 'reserved').length} open</strong>
            <button className="text-button" onClick={signOutAdmin} type="button">Sign out</button>
          </div>
        </div>
        <div className="table-list">
          {bookings.map((booking) => (
            <article className="order-row" key={booking.id}>
              <div>
                <strong>{booking.uniforms?.title || 'Uniform item'}</strong>
                <span>{booking.uniforms?.size || ''} · {booking.pickup_slots?.label || 'Pickup slot'}</span>
                <small>Pickup code {booking.pickup_code}</small>
              </div>
              <button disabled={booking.status === 'completed' || isLoading} onClick={() => completeBooking(booking)} type="button">
                {booking.status === 'completed' ? 'Complete' : 'Check off'}
              </button>
            </article>
          ))}
          {bookings.length === 0 && <p className="muted">No reservations yet.</p>}
        </div>
      </div>

      <form className="admin-panel" onSubmit={addItem}>
        <p className="eyebrow">Inventory</p>
        <h2>Post a uniform</h2>
        <label>
          Item name
          <input value={newItem.title} onChange={(event) => setNewItem({ ...newItem, title: event.target.value })} placeholder="Navy blazer" />
        </label>
        <label>
          Category
          <select value={newItem.category} onChange={(event) => setNewItem({ ...newItem, category: event.target.value })}>
            <option>Blazer</option>
            <option>Shirts</option>
            <option>Pants</option>
            <option>Skirt</option>
            <option>Sweater</option>
            <option>Other</option>
          </select>
        </label>
        <label>
          Size
          <input value={newItem.size} onChange={(event) => setNewItem({ ...newItem, size: event.target.value })} placeholder="Youth M" />
        </label>
        <label>
          Condition
          <select value={newItem.condition} onChange={(event) => setNewItem({ ...newItem, condition: event.target.value })}>
            <option>Like new</option>
            <option>Gently used</option>
            <option>Good</option>
            <option>Needs minor repair</option>
          </select>
        </label>
        <label>
          Photo
          <input
            accept="image/*"
            type="file"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              setPhotoFile(file);
              if (file && !hasSupabaseConfig) {
                setNewItem({ ...newItem, image_url: URL.createObjectURL(file) });
              }
            }}
          />
          {photoFile && <span className="file-pill">{photoFile.name}</span>}
        </label>
        <label>
          Photo URL backup
          <input value={newItem.image_url} onChange={(event) => setNewItem({ ...newItem, image_url: event.target.value })} placeholder="https://..." />
        </label>
        <label>
          Notes
          <textarea value={newItem.notes} onChange={(event) => setNewItem({ ...newItem, notes: event.target.value })} />
        </label>
        <button disabled={isLoading} type="submit">Post item</button>
      </form>

      <form className="admin-panel" onSubmit={addSlot}>
        <p className="eyebrow">Pickup</p>
        <h2>Add time slot</h2>
        <div className="slot-time-grid">
          <label>
            Date
            <input required type="date" value={newSlot.date} onChange={(event) => setNewSlot({ ...newSlot, date: event.target.value })} />
          </label>
          <label>
            Start
            <input required type="time" value={newSlot.startTime} onChange={(event) => setNewSlot({ ...newSlot, startTime: event.target.value })} />
          </label>
          <label>
            End
            <input required type="time" value={newSlot.endTime} onChange={(event) => setNewSlot({ ...newSlot, endTime: event.target.value })} />
          </label>
        </div>
        <label>
          Capacity
          <input min="1" type="number" value={newSlot.capacity} onChange={(event) => setNewSlot({ ...newSlot, capacity: event.target.value })} />
        </label>
        <button disabled={isLoading} type="submit">Add slot</button>
        <div className="slot-list">
          {slots.map((slot) => (
            <span key={slot.id}>{slot.label} · {slot.booked_count}/{slot.capacity}</span>
          ))}
        </div>
      </form>

      <div className="admin-panel wide">
        <p className="eyebrow">Overview</p>
        <h2>Inventory status</h2>
        <div className="inventory-status">
          {uniforms.map((item) => (
            <span key={item.id}>{item.title} · {item.size} · {item.status}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TailorSt;
