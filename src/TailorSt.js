import { useEffect, useMemo, useState } from 'react';
import { hasSupabaseConfig, supabase } from './supabaseClient';
import './TailorSt.css';

const demoUniforms = [
  {
    id: 'sweater-1',
    title: 'Navy school sweater',
    category: 'Sweater',
    size: 'Youth M',
    condition: 'Gently used',
    notes: 'Freshly cleaned, small mark near cuff.',
    image_url: '/uniform-placeholder.svg',
    status: 'available',
  },
  {
    id: 'shirt-1',
    title: 'White uniform shirts',
    category: 'Shirts',
    size: 'Adult S',
    condition: 'Like new',
    notes: 'Set of two short-sleeve shirts.',
    image_url: '/uniform-placeholder.svg',
    status: 'available',
  },
  {
    id: 'skirt-1',
    title: 'Long uniform skirt',
    category: 'Skirt',
    size: 'Youth L',
    condition: 'Good',
    notes: 'Long school-approved length.',
    image_url: '/uniform-placeholder.svg',
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

const adminEmail = process.env.REACT_APP_ADMIN_EMAIL || 'courchia.raphaelle@gmail.com';
const localAdminPasscode = process.env.REACT_APP_ADMIN_PASSCODE || '';

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
  const [uniforms, setUniforms] = useState(() => (hasSupabaseConfig ? [] : demoUniforms));
  const [slots, setSlots] = useState(() => (hasSupabaseConfig ? [] : demoSlots));
  const [bookings, setBookings] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [reservationEmail, setReservationEmail] = useState('');
  const [studentNote, setStudentNote] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPasscode, setAdminPasscode] = useState('');
  const [newItem, setNewItem] = useState(emptyItem);
  const [photoFile, setPhotoFile] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItem, setEditingItem] = useState(emptyItem);
  const [editingPhotoFile, setEditingPhotoFile] = useState(null);
  const [newSlot, setNewSlot] = useState({ date: '', startTime: '', endTime: '', capacity: 1 });
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(hasSupabaseConfig);

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
    const email = reservationEmail.trim().toLowerCase();
    if (!selectedItem || !selectedSlot || !email) return;

    const slot = slots.find((entry) => entry.id === selectedSlot);
    const pickupCode = makePickupCode();
    const booking = {
      uniform_id: selectedItem.id,
      slot_id: selectedSlot,
      pickup_code: pickupCode,
      student_email: email,
      student_note: studentNote.trim(),
      status: 'reserved',
    };

    setIsLoading(true);

    if (hasSupabaseConfig) {
      const bookingResult = await supabase.rpc('reserve_uniform', {
        requested_uniform_id: selectedItem.id,
        requested_slot_id: selectedSlot,
        requested_pickup_code: pickupCode,
        requested_student_email: email,
        requested_student_note: studentNote.trim(),
      });
      if (bookingResult.error) {
        setStatusMessage('This item could not be reserved. Please check your email and pickup time.');
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
    setReservationEmail('');
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
      const result = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPasscode,
      });
      if (result.error) {
        setStatusMessage('That admin passcode did not work.');
        setIsLoading(false);
        return;
      }
      setAdminUnlocked(true);
      setStatusMessage('');
      await loadAdminData();
      setIsLoading(false);
      return;
    }

    if (adminPasscode !== localAdminPasscode) {
      setStatusMessage('That admin passcode did not work.');
      return;
    }
    setAdminUnlocked(true);
    setStatusMessage('');
  }

  async function uploadUniformPhoto(file) {
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-');
    const filePath = `${Date.now()}-${safeName}`;
    const uploadResult = await supabase.storage.from('uniform-photos').upload(filePath, file);

    if (uploadResult.error) {
      throw new Error('The photo could not be uploaded yet. Check the Supabase storage bucket.');
    }

    return supabase.storage.from('uniform-photos').getPublicUrl(filePath).data.publicUrl;
  }

  async function addItem(event) {
    event.preventDefault();
    const item = { ...newItem, title: newItem.title.trim(), size: newItem.size.trim(), notes: newItem.notes.trim() };
    if (!item.title || !item.size) return;

    setIsLoading(true);
    if (hasSupabaseConfig) {
      let imageUrl = item.image_url;
      if (photoFile) {
        try {
          imageUrl = await uploadUniformPhoto(photoFile);
        } catch (error) {
          setStatusMessage(error.message);
          setIsLoading(false);
          return;
        }
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

  function startEditingItem(item) {
    setEditingItemId(item.id);
    setEditingItem({
      title: item.title || '',
      category: item.category || 'Shirts',
      size: item.size || '',
      condition: item.condition || 'Gently used',
      notes: item.notes || '',
      image_url: item.image_url || '',
      status: item.status || 'available',
    });
    setEditingPhotoFile(null);
    setStatusMessage('');
  }

  function cancelEditingItem() {
    setEditingItemId(null);
    setEditingItem(emptyItem);
    setEditingPhotoFile(null);
  }

  async function saveEditedItem(event) {
    event.preventDefault();
    if (!editingItemId) return;

    const item = {
      ...editingItem,
      title: editingItem.title.trim(),
      size: editingItem.size.trim(),
      notes: editingItem.notes.trim(),
    };
    if (!item.title || !item.size) return;

    setIsLoading(true);
    if (hasSupabaseConfig) {
      let imageUrl = item.image_url;
      if (editingPhotoFile) {
        try {
          imageUrl = await uploadUniformPhoto(editingPhotoFile);
        } catch (error) {
          setStatusMessage(error.message);
          setIsLoading(false);
          return;
        }
      }

      const result = await supabase
        .from('uniforms')
        .update({ ...item, image_url: imageUrl })
        .eq('id', editingItemId)
        .select()
        .single();

      if (result.error) {
        setStatusMessage('The item could not be updated yet. Check Supabase table permissions.');
        setIsLoading(false);
        return;
      }

      setUniforms((items) => items.map((entry) => (entry.id === editingItemId ? result.data : entry)));
    } else {
      setUniforms((items) => items.map((entry) => (entry.id === editingItemId ? { ...entry, ...item } : entry)));
    }

    setStatusMessage('Item updated.');
    cancelEditingItem();
    setIsLoading(false);
  }

  async function deleteItem(item) {
    const confirmed = window.confirm(`Delete ${item.title}? This removes it from your inventory list.`);
    if (!confirmed) return;

    setIsLoading(true);
    if (hasSupabaseConfig) {
      const result = await supabase.from('uniforms').delete().eq('id', item.id);

      if (result.error) {
        setStatusMessage('This item could not be deleted. If it has reservation history, change its status to Hidden / gone instead.');
        setIsLoading(false);
        return;
      }
    }

    setUniforms((items) => items.filter((entry) => entry.id !== item.id));
    if (editingItemId === item.id) cancelEditingItem();
    setStatusMessage('Item deleted.');
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
          <span className="brand-mark">
            <img src="/tailor-st-logo.png" alt="" />
          </span>
          <span>
            <strong>Tailor St</strong>
            <small>Uniforms, shared with care</small>
          </span>
        </button>
        <nav className="nav-actions" aria-label="Primary">
          <button className={view === 'shop' ? 'active' : ''} onClick={() => setView('shop')} type="button">
            Browse
          </button>
          <button className={view === 'donate' ? 'active' : ''} onClick={() => setView('donate')} type="button">
            Donate
          </button>
        </nav>
      </header>

      {statusMessage && <p className="status-message">{statusMessage}</p>}

      {view === 'shop' ? (
        <>
          <section className="hero-section">
            <div>
              <p className="eyebrow">No cost. Private pickup. School-ready.</p>
              <h1>Find the uniform you need. Free the budget you deserve.</h1>
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

          {isLoading && availableUniforms.length === 0 ? (
            <section className="empty-state">
              <h2>Loading uniforms...</h2>
              <p>Checking what is available right now.</p>
            </section>
          ) : (
            <section className="inventory-grid" aria-label="Available uniforms">
              {availableUniforms.map((item) => (
                <article className="uniform-card" key={item.id}>
                  <img src={item.image_url || '/uniform-placeholder.svg'} alt="" />
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
          )}

          {!isLoading && availableUniforms.length === 0 && (
            <section className="empty-state">
              <h2>No uniforms are available right now.</h2>
              <p>Check back soon, or ask the program organizer about upcoming donations.</p>
            </section>
          )}
        </>
      ) : view === 'donate' ? (
        <DonateView />
      ) : (
        <AdminView
          addItem={addItem}
          addSlot={addSlot}
          adminPasscode={adminPasscode}
          adminUnlocked={adminUnlocked}
          bookings={bookings}
          cancelEditingItem={cancelEditingItem}
          completeBooking={completeBooking}
          deleteItem={deleteItem}
          editingItem={editingItem}
          editingItemId={editingItemId}
          editingPhotoFile={editingPhotoFile}
          isLoading={isLoading}
          newItem={newItem}
          newSlot={newSlot}
          photoFile={photoFile}
          saveEditedItem={saveEditedItem}
          setAdminPasscode={setAdminPasscode}
          setEditingItem={setEditingItem}
          setEditingPhotoFile={setEditingPhotoFile}
          setNewItem={setNewItem}
          setNewSlot={setNewSlot}
          setPhotoFile={setPhotoFile}
          signOutAdmin={signOutAdmin}
          slots={slots}
          startEditingItem={startEditingItem}
          uniforms={uniforms}
          unlockAdmin={unlockAdmin}
        />
      )}

      <footer className="admin-access">
        <button
          className={view === 'admin' ? 'active' : ''}
          onClick={() => setView('admin')}
          type="button"
        >
          Admin
        </button>
      </footer>

      {selectedItem && (
        <div className="modal-backdrop" role="presentation">
          <section className="reservation-modal" role="dialog" aria-modal="true" aria-label="Reserve uniform">
            <button className="close-button" onClick={() => setSelectedItem(null)} type="button">x</button>
            <img src={selectedItem.image_url} alt="" />
            <form onSubmit={reserveItem}>
              <p className="eyebrow">Reserve for pickup</p>
              <h2>{selectedItem.title}</h2>
              <p className="muted">{selectedItem.size} · {selectedItem.condition}</p>
              <label>
                Email address
                <input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setReservationEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  type="email"
                  value={reservationEmail}
                />
              </label>
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

function DonateView() {
  return (
    <section className="donate-page">
      <div className="donate-hero">
        <p className="eyebrow">Donate uniforms</p>
        <h1>Help another student by passing on what no longer fits.</h1>
        <p>
          We currently accept clean shirts, long skirts, collars, and sweaters for families in our school community.
        </p>
      </div>

      <div className="donation-steps" aria-label="Donation instructions">
        <article>
          <span>1</span>
          <div>
            <h2>Check the condition</h2>
            <p>
              Please donate items that are in relatively good condition: no tears, no stains, and ready for another student to wear.
              Skirts should be the long school-approved style.
            </p>
          </div>
        </article>
        <article>
          <span>2</span>
          <div>
            <h2>Wash everything beforehand</h2>
            <p>Please wash donated uniforms before dropping them off so they are fresh and ready to be sorted.</p>
          </div>
        </article>
        <article>
          <span>3</span>
          <div>
            <h2>Drop off at school</h2>
            <p>
              Place your donation in the Tailor St box next to the front office at 2907 Taylor St.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

function AdminView({
  addItem,
  addSlot,
  adminPasscode,
  adminUnlocked,
  bookings,
  cancelEditingItem,
  completeBooking,
  deleteItem,
  editingItem,
  editingItemId,
  editingPhotoFile,
  isLoading,
  newItem,
  newSlot,
  photoFile,
  saveEditedItem,
  setAdminPasscode,
  setEditingItem,
  setEditingPhotoFile,
  setNewItem,
  setNewSlot,
  setPhotoFile,
  signOutAdmin,
  slots,
  startEditingItem,
  uniforms,
  unlockAdmin,
}) {
  const activeBookings = bookings.filter((booking) => booking.status === 'reserved');
  const completedBookings = bookings.filter((booking) => booking.status === 'completed');

  if (!adminUnlocked) {
    return (
      <section className="admin-login">
        <form onSubmit={unlockAdmin}>
          <p className="eyebrow">Admin portal</p>
          <h1>Manage inventory, pickup slots, and reservations.</h1>
          <label>
            Passcode
            <input
              type="password"
              value={adminPasscode}
              onChange={(event) => setAdminPasscode(event.target.value)}
              placeholder="Enter admin passcode"
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
            <strong>{activeBookings.length} open · {completedBookings.length} complete</strong>
            <button className="text-button" onClick={signOutAdmin} type="button">Sign out</button>
          </div>
        </div>
        <div className="table-list">
          <p className="eyebrow">Open reservations</p>
          {activeBookings.map((booking) => (
            <article className="order-row" key={booking.id}>
              <div>
                <strong>{booking.uniforms?.title || 'Uniform item'}</strong>
                <span>{booking.uniforms?.size || ''} · {booking.pickup_slots?.label || 'Pickup slot'}</span>
                <small>Email {booking.student_email || 'Not collected'}</small>
                <small>Pickup code {booking.pickup_code}</small>
                {booking.student_note && <small>Note: {booking.student_note}</small>}
              </div>
              <button disabled={isLoading} onClick={() => completeBooking(booking)} type="button">
                Check off
              </button>
            </article>
          ))}
          {activeBookings.length === 0 && <p className="muted">No open reservations right now.</p>}

          {completedBookings.length > 0 && (
            <>
              <p className="eyebrow">Completed orders</p>
              {completedBookings.map((booking) => (
                <article className="order-row completed-order" key={booking.id}>
                  <div>
                    <strong>{booking.uniforms?.title || 'Uniform item'}</strong>
                    <span>{booking.uniforms?.size || ''} · {booking.pickup_slots?.label || 'Pickup slot'}</span>
                    <small>Email {booking.student_email || 'Not collected'}</small>
                    <small>Pickup code {booking.pickup_code}</small>
                    {booking.student_note && <small>Note: {booking.student_note}</small>}
                  </div>
                  <span className="status-pill">Complete</span>
                </article>
              ))}
            </>
          )}
        </div>
      </div>

      <form className="admin-panel" onSubmit={addItem}>
        <p className="eyebrow">Inventory</p>
        <h2>Post a uniform</h2>
        <label>
          Item name
          <input value={newItem.title} onChange={(event) => setNewItem({ ...newItem, title: event.target.value })} placeholder="White uniform shirt" />
        </label>
        <label>
          Category
          <select value={newItem.category} onChange={(event) => setNewItem({ ...newItem, category: event.target.value })}>
            <option>Shirts</option>
            <option>Skirt</option>
            <option>Collar</option>
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
        <h2>Inventory editor</h2>
        <div className="inventory-editor">
          {uniforms.map((item) => (
            <article className="inventory-edit-row" key={item.id}>
              {editingItemId === item.id ? (
                <form className="inventory-edit-form" onSubmit={saveEditedItem}>
                  <div className="edit-photo-preview">
                    <img src={editingItem.image_url || '/uniform-placeholder.svg'} alt="" />
                  </div>
                  <div className="edit-field-grid">
                    <label>
                      Item name
                      <input
                        value={editingItem.title}
                        onChange={(event) => setEditingItem({ ...editingItem, title: event.target.value })}
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={editingItem.category}
                        onChange={(event) => setEditingItem({ ...editingItem, category: event.target.value })}
                      >
                        <option>Shirts</option>
                        <option>Skirt</option>
                        <option>Collar</option>
                        <option>Sweater</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label>
                      Size
                      <input
                        value={editingItem.size}
                        onChange={(event) => setEditingItem({ ...editingItem, size: event.target.value })}
                      />
                    </label>
                    <label>
                      Condition
                      <select
                        value={editingItem.condition}
                        onChange={(event) => setEditingItem({ ...editingItem, condition: event.target.value })}
                      >
                        <option>Like new</option>
                        <option>Gently used</option>
                        <option>Good</option>
                        <option>Needs minor repair</option>
                      </select>
                    </label>
                    <label>
                      Status
                      <select
                        value={editingItem.status}
                        onChange={(event) => setEditingItem({ ...editingItem, status: event.target.value })}
                      >
                        <option value="available">Available</option>
                        <option value="reserved">Reserved</option>
                        <option value="completed">Hidden / gone</option>
                      </select>
                    </label>
                    <label>
                      Replace photo
                      <input
                        accept="image/*"
                        type="file"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          setEditingPhotoFile(file);
                          if (file && !hasSupabaseConfig) {
                            setEditingItem({ ...editingItem, image_url: URL.createObjectURL(file) });
                          }
                        }}
                      />
                      {editingPhotoFile && <span className="file-pill">{editingPhotoFile.name}</span>}
                    </label>
                    <label className="wide-field">
                      Photo URL
                      <input
                        value={editingItem.image_url}
                        onChange={(event) => setEditingItem({ ...editingItem, image_url: event.target.value })}
                      />
                    </label>
                    <label className="wide-field">
                      Notes
                      <textarea
                        value={editingItem.notes}
                        onChange={(event) => setEditingItem({ ...editingItem, notes: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="edit-actions">
                    <button disabled={isLoading} type="submit">{isLoading ? 'Saving...' : 'Save changes'}</button>
                    <button className="secondary-button" onClick={cancelEditingItem} type="button">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <img src={item.image_url || '/uniform-placeholder.svg'} alt="" />
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.category} · {item.size} · {item.condition}</span>
                    <small>{item.status === 'available' ? 'Visible on Browse' : item.status}</small>
                  </div>
                  <button onClick={() => startEditingItem(item)} type="button">Edit</button>
                  <button className="danger-button" disabled={isLoading} onClick={() => deleteItem(item)} type="button">
                    Delete
                  </button>
                </>
              )}
            </article>
          ))}
          {uniforms.length === 0 && <p className="muted">No inventory yet.</p>}
        </div>
      </div>
    </section>
  );
}

export default TailorSt;
