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
const uniformsPageSize = 9;

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

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function parseLabelEndTime(label, fallbackTime) {
  const match = label?.match(/-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i);
  if (!match) return fallbackTime;

  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === 'PM') hour += 12;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

function makePickupCode() {
  return `TS-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function loadCartIds() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('tailor-st-cart') || '[]');
    return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function TailorSt() {
  const [view, setView] = useState('shop');
  const [uniforms, setUniforms] = useState(() => (hasSupabaseConfig ? [] : demoUniforms));
  const [slots, setSlots] = useState(() => (hasSupabaseConfig ? [] : demoSlots));
  const [bookings, setBookings] = useState([]);
  const [cartIds, setCartIds] = useState(loadCartIds);
  const [cartOpen, setCartOpen] = useState(false);
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
  const [editingSlotId, setEditingSlotId] = useState(null);
  const [editingSlot, setEditingSlot] = useState({ date: '', startTime: '', endTime: '', capacity: 1 });
  const [statusMessage, setStatusMessage] = useState('');
  const [isLoading, setIsLoading] = useState(hasSupabaseConfig);
  const [visibleUniformCount, setVisibleUniformCount] = useState(uniformsPageSize);

  const availableUniforms = useMemo(
    () => uniforms.filter((item) => item.status === 'available'),
    [uniforms]
  );

  const visibleUniforms = useMemo(
    () => availableUniforms.slice(0, visibleUniformCount),
    [availableUniforms, visibleUniformCount]
  );

  const activeSlots = useMemo(
    () => slots.filter((slot) => slot.is_active && Number(slot.booked_count) < Number(slot.capacity)),
    [slots]
  );

  const cartItems = useMemo(
    () => cartIds.map((id) => uniforms.find((item) => item.id === id)).filter(Boolean),
    [cartIds, uniforms]
  );

  useEffect(() => {
    window.localStorage.setItem('tailor-st-cart', JSON.stringify(cartIds));
  }, [cartIds]);

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
    const feedback = studentNote.trim();
    if (cartItems.length === 0 || !selectedSlot || !email || feedback.length < 10) return;

    const slot = slots.find((entry) => entry.id === selectedSlot);
    const pickupCode = makePickupCode();
    let savedPickupCode = pickupCode;
    let reservationGroupId = `reservation-${Date.now()}`;

    setIsLoading(true);

    if (hasSupabaseConfig) {
      const bookingResult = await supabase.rpc('reserve_uniforms', {
        requested_uniform_ids: cartItems.map((item) => item.id),
        requested_slot_id: selectedSlot,
        requested_student_email: email,
        requested_student_note: feedback,
        requested_testimonial_consent: true,
      });
      if (bookingResult.error) {
        const [uniformResult, slotResult] = await Promise.all([
          supabase.from('uniforms').select('*').eq('status', 'available').order('created_at', { ascending: false }),
          supabase.from('pickup_slots').select('*').eq('is_active', true).order('starts_at', { ascending: true }),
        ]);
        if (!uniformResult.error && uniformResult.data) {
          setUniforms(uniformResult.data);
          const availableIds = new Set(uniformResult.data.map((item) => item.id));
          setCartIds((ids) => ids.filter((id) => availableIds.has(id)));
        }
        if (!slotResult.error && slotResult.data) setSlots(slotResult.data);
        setStatusMessage('Your reservation could not be completed. An item or pickup time may no longer be available, so your cart was refreshed.');
        setIsLoading(false);
        return;
      }
      savedPickupCode = bookingResult.data?.[0]?.pickup_code || pickupCode;
      reservationGroupId = bookingResult.data?.[0]?.reservation_group_id || reservationGroupId;
    }

    const reservedIds = new Set(cartItems.map((item) => item.id));
    setUniforms((items) =>
      items.map((item) => (reservedIds.has(item.id) ? { ...item, status: 'reserved' } : item))
    );
    setSlots((entries) =>
      entries.map((entry) =>
        entry.id === selectedSlot ? { ...entry, booked_count: Number(entry.booked_count) + 1 } : entry
      )
    );
    setBookings((entries) => [
      ...cartItems.map((item, index) => ({
        id: `${item.id}-${Date.now()}-${index}`,
        reservation_group_id: reservationGroupId,
        uniform_id: item.id,
        slot_id: selectedSlot,
        pickup_code: savedPickupCode,
        student_email: email,
        student_note: feedback,
        testimonial_consent: true,
        status: 'reserved',
        uniforms: { title: item.title, size: item.size },
        pickup_slots: { label: slot.label },
      })),
      ...entries,
    ]);
    setConfirmation({ items: cartItems.map((item) => item.title), slot: slot.label, pickupCode: savedPickupCode });
    setCartIds([]);
    setCartOpen(false);
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

  function startEditingSlot(slot) {
    const start = slot.starts_at ? new Date(slot.starts_at) : new Date();
    const startTime = formatTimeInput(start);
    setEditingSlotId(slot.id);
    setEditingSlot({
      date: formatDateInput(start),
      startTime,
      endTime: parseLabelEndTime(slot.label, startTime),
      capacity: Number(slot.capacity),
    });
    setStatusMessage('');
  }

  function cancelEditingSlot() {
    setEditingSlotId(null);
    setEditingSlot({ date: '', startTime: '', endTime: '', capacity: 1 });
  }

  async function saveEditedSlot(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submittedSlot = {
      date: form.elements.slotDate.value,
      startTime: form.elements.slotStartTime.value,
      endTime: form.elements.slotEndTime.value,
      capacity: form.elements.slotCapacity.value,
    };
    if (!editingSlotId || !submittedSlot.date || !submittedSlot.startTime || !submittedSlot.endTime) return;

    const capacity = Number(submittedSlot.capacity);
    const currentSlot = slots.find((slot) => slot.id === editingSlotId);
    if (!currentSlot || capacity < Number(currentSlot.booked_count) || capacity < 1) {
      setStatusMessage(`Capacity cannot be lower than the ${currentSlot?.booked_count || 0} existing bookings.`);
      return;
    }

    const changes = {
      label: formatSlotLabel(submittedSlot.date, submittedSlot.startTime, submittedSlot.endTime),
      starts_at: new Date(`${submittedSlot.date}T${submittedSlot.startTime}`).toISOString(),
      capacity,
    };

    setIsLoading(true);
    if (hasSupabaseConfig) {
      const result = await supabase
        .from('pickup_slots')
        .update(changes)
        .eq('id', editingSlotId)
        .select()
        .single();

      if (result.error) {
        setStatusMessage('The pickup slot could not be updated. Check Supabase table permissions.');
        setIsLoading(false);
        return;
      }

      setSlots((entries) => entries.map((entry) => (entry.id === editingSlotId ? result.data : entry)));
    } else {
      setSlots((entries) => entries.map((entry) => (entry.id === editingSlotId ? { ...entry, ...changes } : entry)));
    }

    setStatusMessage('Pickup slot updated.');
    cancelEditingSlot();
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

  async function completeBooking(order) {
    setIsLoading(true);
    if (hasSupabaseConfig) {
      await supabase.from('bookings').update({ status: 'completed' }).in('id', order.bookingIds);
      await supabase.from('uniforms').update({ status: 'completed' }).in('id', order.uniformIds);
    }
    setBookings((entries) =>
      entries.map((entry) => (order.bookingIds.includes(entry.id) ? { ...entry, status: 'completed' } : entry))
    );
    setUniforms((items) =>
      items.map((item) => (order.uniformIds.includes(item.id) ? { ...item, status: 'completed' } : item))
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
          <button
            aria-label={`Cart with ${cartItems.length} ${cartItems.length === 1 ? 'item' : 'items'}`}
            className="cart-nav-button"
            onClick={() => setCartOpen(true)}
            type="button"
          >
            Cart <span className="cart-count">{cartItems.length}</span>
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

          {isLoading && availableUniforms.length === 0 ? (
            <section className="empty-state">
              <h2>Loading uniforms...</h2>
              <p>Checking what is available right now.</p>
            </section>
          ) : (
            <section className="inventory-grid" aria-label="Available uniforms">
              {visibleUniforms.map((item) => (
                <article className="uniform-card" key={item.id}>
                  <img src={item.image_url || '/uniform-placeholder.svg'} alt="" />
                  <div className="uniform-card-body">
                    <div className="card-heading">
                      <h2>{item.title}</h2>
                      <span>{item.size}</span>
                    </div>
                    <p>{item.category} · {item.condition}</p>
                    <p className="muted">{item.notes}</p>
                    <button
                      className={cartIds.includes(item.id) ? 'added-to-cart' : ''}
                      disabled={cartIds.includes(item.id)}
                      onClick={() => {
                        setCartIds((ids) => (ids.includes(item.id) ? ids : [...ids, item.id]));
                        setStatusMessage(`${item.title} was added to your cart.`);
                      }}
                      type="button"
                    >
                      {cartIds.includes(item.id) ? 'Added to cart' : 'Add to cart'}
                    </button>
                  </div>
                </article>
              ))}
            </section>
          )}

          {!isLoading && visibleUniformCount < availableUniforms.length && (
            <div className="load-more-section">
              <button
                className="load-more-button"
                onClick={() => setVisibleUniformCount((count) => count + uniformsPageSize)}
                type="button"
              >
                Load more
              </button>
              <p aria-live="polite">
                Showing {visibleUniforms.length} of {availableUniforms.length} pieces
              </p>
            </div>
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
          cancelEditingSlot={cancelEditingSlot}
          completeBooking={completeBooking}
          deleteItem={deleteItem}
          editingItem={editingItem}
          editingItemId={editingItemId}
          editingPhotoFile={editingPhotoFile}
          editingSlot={editingSlot}
          editingSlotId={editingSlotId}
          isLoading={isLoading}
          newItem={newItem}
          newSlot={newSlot}
          photoFile={photoFile}
          saveEditedItem={saveEditedItem}
          saveEditedSlot={saveEditedSlot}
          setAdminPasscode={setAdminPasscode}
          setEditingItem={setEditingItem}
          setEditingPhotoFile={setEditingPhotoFile}
          setEditingSlot={setEditingSlot}
          setNewItem={setNewItem}
          setNewSlot={setNewSlot}
          setPhotoFile={setPhotoFile}
          signOutAdmin={signOutAdmin}
          slots={slots}
          startEditingItem={startEditingItem}
          startEditingSlot={startEditingSlot}
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

      {confirmation && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-label="Reservation saved">
            <p className="eyebrow">Reservation saved</p>
            <h2>Show this pickup code when you arrive.</h2>
            <div className="pickup-code-display" aria-label={`Pickup code ${confirmation.pickupCode}`}>
              {confirmation.pickupCode}
            </div>
            <p>
              {confirmation.items.length === 1 ? 'Your item is' : `${confirmation.items.length} items are`} reserved for {confirmation.slot}.
            </p>
            <ul className="confirmation-items" aria-label="Reserved items">
              {confirmation.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <button onClick={() => setConfirmation(null)} type="button">Done</button>
          </section>
        </div>
      )}

      {cartOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="cart-modal" role="dialog" aria-modal="true" aria-labelledby="cart-title">
            <button aria-label="Close cart" className="close-button" onClick={() => setCartOpen(false)} type="button">×</button>
            <div className="cart-heading"><h2 id="cart-title">Cart</h2></div>
            {cartItems.length === 0 ? (
              <div className="cart-empty-state">
                <h3>Your cart is empty.</h3>
                <p className="muted">Add the uniforms you need, then come back here to reserve them.</p>
                <button onClick={() => setCartOpen(false)} type="button">Keep browsing</button>
              </div>
            ) : <>
              <div className="cart-list" aria-label="Items in cart">
                {cartItems.map((item) => (
                  <article className="cart-row" key={item.id}>
                    <img src={item.image_url || '/uniform-placeholder.svg'} alt="" />
                    <div><strong>{item.title}</strong><span>{item.size} · {item.condition}</span></div>
                    <button onClick={() => setCartIds((ids) => ids.filter((id) => id !== item.id))} type="button">Remove</button>
                  </article>
                ))}
              </div>
              <form className="cart-checkout-form" onSubmit={reserveItem}>
              <div className="checkout-intro">
                <p className="eyebrow">No payment needed</p>
                <h3>Complete your reservation</h3>
                <p>Instead of paying, leave short feedback about how Tailor St helps you!</p>
              </div>
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
                  <option value="">
                    {activeSlots.length === 0 ? 'No available pickup dates' : 'Choose a time'}
                  </option>
                  {activeSlots.map((slot) => (
                    <option key={slot.id} value={slot.id}>
                      {slot.label} ({Number(slot.capacity) - Number(slot.booked_count)} open)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Your feedback
                <span className="field-helper">At least 10 characters. Feedback may be shared anonymously as a Tailor St testimonial.</span>
                <textarea
                  maxLength="500"
                  minLength="10"
                  required
                  value={studentNote}
                  onChange={(event) => setStudentNote(event.target.value)}
                />
                <span className="character-count">{studentNote.length}/500</span>
              </label>
              <button disabled={isLoading || activeSlots.length === 0} type="submit">
                {isLoading ? 'Reserving...' : `Reserve ${cartItems.length} ${cartItems.length === 1 ? 'item' : 'items'}`}
              </button>
            </form>
            </>}
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
  cancelEditingSlot,
  completeBooking,
  deleteItem,
  editingItem,
  editingItemId,
  editingPhotoFile,
  editingSlot,
  editingSlotId,
  isLoading,
  newItem,
  newSlot,
  photoFile,
  saveEditedItem,
  saveEditedSlot,
  setAdminPasscode,
  setEditingItem,
  setEditingPhotoFile,
  setEditingSlot,
  setNewItem,
  setNewSlot,
  setPhotoFile,
  signOutAdmin,
  slots,
  startEditingItem,
  startEditingSlot,
  uniforms,
  unlockAdmin,
}) {
  const orders = Array.from(bookings.reduce((grouped, booking) => {
    const orderId = booking.reservation_group_id || booking.id;
    const order = grouped.get(orderId) || {
      id: orderId,
      bookingIds: [],
      uniformIds: [],
      items: [],
      pickupCode: booking.pickup_code,
      pickupLabel: booking.pickup_slots?.label || 'Pickup slot',
      studentEmail: booking.student_email,
      studentNote: booking.student_note,
      status: 'completed',
    };

    order.bookingIds.push(booking.id);
    order.uniformIds.push(booking.uniform_id);
    order.items.push({
      id: booking.uniform_id,
      title: booking.uniforms?.title || 'Uniform item',
      size: booking.uniforms?.size || '',
    });
    if (booking.status === 'reserved') order.status = 'reserved';
    grouped.set(orderId, order);
    return grouped;
  }, new Map()).values());

  const activeBookings = orders.filter((order) => order.status === 'reserved');
  const completedBookings = orders.filter((order) => order.status === 'completed');

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
          {activeBookings.map((order) => (
            <article className="order-row" key={order.id}>
              <div>
                <strong>{order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {order.pickupLabel}</strong>
                <ul className="reservation-item-list">
                  {order.items.map((item) => (
                    <li key={`${order.id}-${item.id}`}>{item.title}{item.size ? ` · ${item.size}` : ''}</li>
                  ))}
                </ul>
                <small>Email {order.studentEmail || 'Not collected'}</small>
                <small>Pickup code {order.pickupCode}</small>
                {order.studentNote && <small>Note: {order.studentNote}</small>}
              </div>
              <button disabled={isLoading} onClick={() => completeBooking(order)} type="button">
                Check off all
              </button>
            </article>
          ))}
          {activeBookings.length === 0 && <p className="muted">No open reservations right now.</p>}

          {completedBookings.length > 0 && (
            <>
              <p className="eyebrow">Completed orders</p>
              {completedBookings.map((order) => (
                <article className="order-row completed-order" key={order.id}>
                  <div>
                    <strong>{order.items.length} {order.items.length === 1 ? 'item' : 'items'} · {order.pickupLabel}</strong>
                    <ul className="reservation-item-list">
                      {order.items.map((item) => (
                        <li key={`${order.id}-${item.id}`}>{item.title}{item.size ? ` · ${item.size}` : ''}</li>
                      ))}
                    </ul>
                    <small>Email {order.studentEmail || 'Not collected'}</small>
                    <small>Pickup code {order.pickupCode}</small>
                    {order.studentNote && <small>Note: {order.studentNote}</small>}
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

      <div className="admin-panel">
        <p className="eyebrow">Pickup</p>
        <h2>Add time slot</h2>
        <form className="add-slot-form" onSubmit={addSlot}>
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
        </form>
        <div className="slot-list">
          {slots.map((slot) => (
            <div className="slot-edit-row" key={slot.id}>
              {editingSlotId === slot.id ? (
                <form className="slot-edit-form" onSubmit={saveEditedSlot}>
                  <div className="slot-time-grid">
                    <label>
                      Date
                      <input
                        required
                        name="slotDate"
                        type="date"
                        value={editingSlot.date}
                        onChange={(event) => setEditingSlot({ ...editingSlot, date: event.target.value })}
                      />
                    </label>
                    <label>
                      Start
                      <input
                        required
                        name="slotStartTime"
                        type="time"
                        value={editingSlot.startTime}
                        onChange={(event) => setEditingSlot({ ...editingSlot, startTime: event.target.value })}
                      />
                    </label>
                    <label>
                      End
                      <input
                        required
                        name="slotEndTime"
                        type="time"
                        value={editingSlot.endTime}
                        onChange={(event) => setEditingSlot({ ...editingSlot, endTime: event.target.value })}
                      />
                    </label>
                  </div>
                  <label>
                    Capacity
                    <input
                      min={Math.max(1, Number(slot.booked_count))}
                      name="slotCapacity"
                      type="number"
                      value={editingSlot.capacity}
                      onChange={(event) => setEditingSlot({ ...editingSlot, capacity: event.target.value })}
                    />
                  </label>
                  <small>{slot.booked_count} existing booking{Number(slot.booked_count) === 1 ? '' : 's'}</small>
                  <div className="edit-actions">
                    <button disabled={isLoading} type="submit">Save slot</button>
                    <button className="secondary-button" onClick={cancelEditingSlot} type="button">Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <strong>{slot.label}</strong>
                    <span>{slot.booked_count}/{slot.capacity} booked</span>
                  </div>
                  <button className="secondary-button" onClick={() => startEditingSlot(slot)} type="button">Edit</button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

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
