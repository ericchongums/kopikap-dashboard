// Check authentication
let currentUser = null;
let ordersListener = null;
let currentFilter = 'all';

// Track existing orders to detect new ones
let existingOrderIds = new Set();
let isFirstLoad = true; // Don't play sound on initial load

// Audio notification
let notificationSound = null;

// Check if user is authenticated and has barista role
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = '../index.html';
        return;
    }

    currentUser = user;

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            await auth.signOut();
            window.location.href = '../index.html';
            return;
        }

        const userData = userDoc.data();

        if (userData.role !== 'barista') {
            alert('Access denied. Barista access only.');
            await auth.signOut();
            window.location.href = '../index.html';
            return;
        }

        // Load barista profile
        loadBaristaProfile(userData);

        // Initialize notification sound
        initializeNotificationSound();

        // Start listening to orders
        listenToOrders();

        // Start listening to pickup orders (ready for pickup section)
        listenToPickupOrders();

    } catch (error) {
        console.error('Error verifying user:', error);
        await auth.signOut();
        window.location.href = '../index.html';
    }
});

// Load barista profile info
function loadBaristaProfile(userData) {
    const baristaName = document.getElementById('baristaName');
    const baristaAvatar = document.getElementById('baristaAvatar');

    baristaName.textContent = userData.name || 'Barista';

    if (userData.profileImageUrl) {
        baristaAvatar.src = userData.profileImageUrl;
    } else {
        // Create initial avatar
        const initials = userData.name ? userData.name.charAt(0).toUpperCase() : 'B';
        baristaAvatar.src = `https://ui-avatars.com/api/?name=${initials}&background=2D5F3F&color=fff&size=40`;
    }
}

// Initialize notification sound
function initializeNotificationSound() {
    notificationSound = document.getElementById('newOrderSound');

    if (!notificationSound) {
        console.error('❌ Notification sound element not found');
        return;
    }

    // Set volume
    notificationSound.volume = 0.7;

    console.log('🔊 Notification sound initialized');

    // Enable sound on first user interaction (browser autoplay policy)
    const enableSound = () => {
        notificationSound.load();
        console.log('✅ Sound enabled - ready to play notifications');
        document.removeEventListener('click', enableSound);
    };

    document.addEventListener('click', enableSound, { once: true });
}

// Play notification sound
function playNotificationSound() {
    if (!notificationSound) {
        console.warn('⚠️ Notification sound not initialized');
        return;
    }

    try {
        notificationSound.currentTime = 0; // Reset to start
        const playPromise = notificationSound.play();

        if (playPromise !== undefined) {
            playPromise
                .then(() => {
                    console.log('🔊 Notification sound played');
                })
                .catch(error => {
                    console.warn('⚠️ Could not play sound (user interaction may be required):', error.message);
                });
        }
    } catch (error) {
        console.error('❌ Error playing notification sound:', error);
    }
}

// Show browser notification (optional - requires permission)
function showBrowserNotification(title, message) {
    // Check if browser supports notifications
    if (!('Notification' in window)) {
        return;
    }

    // Request permission if not granted
    if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(title, {
                    body: message,
                    icon: '../css/bg_kiosk_display.png', // Optional icon
                    badge: '../css/bg_kiosk_display.png'
                });
            }
        });
    } else if (Notification.permission === 'granted') {
        new Notification(title, {
            body: message,
            icon: '../css/bg_kiosk_display.png',
            badge: '../css/bg_kiosk_display.png'
        });
    }
}

// Listen to orders in real-time
// Only show orders that have been PAID (paymentStatus == 'paid')
function listenToOrders() {
    ordersListener = db.collection('orders')
        .where('orderStatus', 'in', ['pending', 'preparing'])
        .where('paymentStatus', '==', 'paid')  // Only show paid orders
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            const orders = [];
            let hasNewOrder = false;

            snapshot.forEach((doc) => {
                const orderId = doc.id;
                const orderData = doc.data();

                orders.push({
                    id: orderId,
                    ...orderData
                });

                // Check if this is a new order (pending status)
                if (!existingOrderIds.has(orderId) && orderData.orderStatus === 'pending') {
                    hasNewOrder = true;
                    console.log(`🆕 New order detected: ${orderId} (Pickup: ${orderData.pickupNumber})`);
                }

                existingOrderIds.add(orderId);
            });

            displayOrders(orders);
            updateStats(orders);

            // Play notification sound for new pending orders
            if (hasNewOrder && !isFirstLoad) {
                console.log('🔊 Playing notification sound for new order');
                playNotificationSound();

                // Optional: Show browser notification
                showBrowserNotification('New Order!', 'A new order has been placed.');
            }

            // After first load, enable sound notifications
            if (isFirstLoad) {
                isFirstLoad = false;
                console.log('✅ First load complete - notifications enabled');
            }
        }, (error) => {
            console.error('Error listening to orders:', error);
        });

    // Also listen to completed orders for stats update
    db.collection('completed_orders')
        .onSnapshot((snapshot) => {
            // Update completed count whenever a new order is completed
            getCompletedTodayCount();
        }, (error) => {
            console.error('Error listening to completed orders:', error);
        });
}

// Display orders in grid
function displayOrders(orders) {
    const ordersGrid = document.getElementById('ordersGrid');
    const emptyState = document.getElementById('emptyState');

    // Filter orders based on current filter
    let filteredOrders = orders;
    if (currentFilter !== 'all') {
        filteredOrders = orders.filter(order => order.orderStatus === currentFilter);
    }

    if (filteredOrders.length === 0) {
        emptyState.style.display = 'block';
        // Remove all order cards
        const orderCards = ordersGrid.querySelectorAll('.order-card');
        orderCards.forEach(card => card.remove());
        return;
    }

    emptyState.style.display = 'none';

    // Clear existing cards
    const orderCards = ordersGrid.querySelectorAll('.order-card');
    orderCards.forEach(card => card.remove());

    // Create order cards
    filteredOrders.forEach(order => {
        const orderCard = createOrderCard(order);
        ordersGrid.appendChild(orderCard);
    });
}

// Create order card HTML
function createOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card';
    card.dataset.orderId = order.id;
    card.dataset.status = order.orderStatus;

    const orderTime = order.createdAt ? formatTime(order.createdAt.toDate()) : 'Just now';
    const customerInitial = order.userName ? order.userName.charAt(0).toUpperCase() : 'C';

    const orderTypeIcon = order.orderType === 'Dine In' ? '🍽️' : '📦';
    const orderTypeText = order.orderType || 'Pick Up';

    const itemsHTML = order.items.map(item => {
        let itemHTML = `<div class="order-item">
            <div>
                <div class="item-name">${item.quantity}x ${item.coffeeName}</div>
                <div class="item-details">${item.variant}, ${item.size}</div>`;

        // Show customizations only if they exist
        if (item.customizations && item.customizations.trim() !== '') {
            itemHTML += `<div class="item-customizations" style="color: #666; font-size: 13px; margin-top: 4px;">
                ${item.customizations}
            </div>`;
        }

        itemHTML += `</div></div>`;
        return itemHTML;
    }).join('');

    const actionsHTML = order.orderStatus === 'pending'
        ? `<button class="btn btn-primary" onclick="startPreparing('${order.id}', this)">Start Preparing</button>`
        : `<button class="btn btn-success" onclick="markAsCompleted('${order.id}', this)">Mark as Done</button>`;

    card.innerHTML = `
        <div class="order-header">
            <div>
                <div class="order-id">#${order.orderId.substring(0, 8).toUpperCase()}</div>
                <div class="order-time">${orderTime}</div>
            </div>
            <div class="order-status ${order.orderStatus}">${order.orderStatus}</div>
        </div>

        <div class="customer-info">
            <div class="customer-avatar">${customerInitial}</div>
            <div class="customer-name">${order.userName || 'Customer'}</div>
        </div>

        <div class="order-type" style="color: #2D5F3F; font-weight: bold; font-size: 14px; margin: 8px 0;">
            ${orderTypeIcon} ${orderTypeText}
        </div>

        <div class="order-items">
            ${itemsHTML}
        </div>

        <div class="order-actions">
            ${actionsHTML}
        </div>
    `;

    return card;
}

// Format timestamp to readable time
function formatTime(date) {
    const now = new Date();
    const diffInMinutes = Math.floor((now - date) / 60000);

    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes} min ago`;

    const hours = Math.floor(diffInMinutes / 60);
    if (hours < 24) return `${hours}h ago`;

    return date.toLocaleDateString();
}

// Update statistics
function updateStats(orders) {
    const pendingOrders = orders.filter(o => o.orderStatus === 'pending');
    const preparingOrders = orders.filter(o => o.orderStatus === 'preparing');

    document.getElementById('pendingCount').textContent = pendingOrders.length;
    document.getElementById('preparingCount').textContent = preparingOrders.length;

    // Get completed orders for today
    getCompletedTodayCount();

    // Update notification badge
    const badge = document.getElementById('notificationBadge');
    if (pendingOrders.length > 0) {
        badge.textContent = pendingOrders.length;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

// Get completed orders count for today
async function getCompletedTodayCount() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = firebase.firestore.Timestamp.fromDate(today);

    try {
        // Query all completed orders from completed_orders collection
        const snapshot = await db.collection('completed_orders')
            .get();

        // Filter for today's orders
        let todayCount = 0;
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.completedAt && data.completedAt >= todayTimestamp) {
                todayCount++;
            }
        });

        document.getElementById('completedTodayCount').textContent = todayCount;
        console.log(`Completed today: ${todayCount} out of ${snapshot.size} total completed orders`);
    } catch (error) {
        console.error('Error getting completed count:', error);
        console.error('Error details:', error.message);
        document.getElementById('completedTodayCount').textContent = '0';
    }
}

// Start preparing order
async function startPreparing(orderId, buttonElement) {
    if (!confirm('Start preparing this order?')) return;

    const button = buttonElement || event.target;
    button.disabled = true;
    button.textContent = 'Processing...';

    try {
        await db.collection('orders').doc(orderId).update({
            orderStatus: 'preparing',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        console.log('Order marked as preparing:', orderId);

    } catch (error) {
        console.error('Error updating order:', error);
        alert('Failed to update order. Please try again.');
        button.disabled = false;
        button.textContent = 'Start Preparing';
    }
}

// Mark order as completed
async function markAsCompleted(orderId, buttonElement) {
    if (!confirm('Mark this order as completed?')) return;

    const button = buttonElement || event.target;
    button.disabled = true;
    button.textContent = 'Processing...';

    try {
        console.log('Starting to complete order:', orderId);

        // Get current pickup counter
        console.log('Fetching pickup counter...');
        const counterDoc = await db.collection('pickup_counter').doc('daily_counter').get();
        let currentCounter = counterDoc.exists ? counterDoc.data().counter : 0;
        console.log('Current counter:', currentCounter);

        // Increment counter
        currentCounter += 1;
        const pickupNumber = String(currentCounter).padStart(4, '0');
        console.log('Generated pickup number:', pickupNumber);

        // Get the order data first
        console.log('Fetching order data...');
        const orderDoc = await db.collection('orders').doc(orderId).get();

        if (!orderDoc.exists) {
            throw new Error('Order not found in orders collection');
        }

        const orderData = orderDoc.data();
        console.log('Order data retrieved:', orderData);

        // Prepare updated order data with completed status
        const completedOrderData = {
            orderStatus: 'completed',
            pickupNumber: pickupNumber,
            completedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        console.log('Preparing batch write...');

        // Use batch to: 1) Update order in orders collection, 2) Update counter, 3) Save to completed_orders for archiving
        const batch = db.batch();

        // Update order in orders collection (keep it here for customer notification)
        const orderRef = db.collection('orders').doc(orderId);
        batch.update(orderRef, completedOrderData);
        console.log('Added to batch: Update order status to completed');

        // Also save to completed_orders collection for archiving
        const completedOrderRef = db.collection('completed_orders').doc(orderId);
        batch.set(completedOrderRef, {
            ...orderData,
            ...completedOrderData
        });
        console.log('Added to batch: Save to completed_orders');

        // Update pickup counter
        const counterRef = db.collection('pickup_counter').doc('daily_counter');
        batch.set(counterRef, {
            counter: currentCounter,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        console.log('Added to batch: Update counter');

        console.log('Committing batch...');
        await batch.commit();

        console.log('✅ Order completed successfully with pickup number:', pickupNumber);
        alert(`Order completed! Pickup number: ${pickupNumber}`);

    } catch (error) {
        console.error('❌ Error completing order:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Full error:', error);

        let errorMessage = 'Failed to complete order. ';
        if (error.code === 'permission-denied') {
            errorMessage += 'Permission denied. Check Firestore security rules.';
        } else if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'Please check console for details.';
        }

        alert(errorMessage);
        button.disabled = false;
        button.textContent = 'Mark as Done';
    }
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Update active state
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // Update filter
        currentFilter = btn.dataset.filter;

        // Trigger re-render (the real-time listener will handle this)
        // Just trigger a manual update of displayed orders
        const ordersGrid = document.getElementById('ordersGrid');
        const allCards = ordersGrid.querySelectorAll('.order-card');

        if (currentFilter === 'all') {
            allCards.forEach(card => card.style.display = 'block');
        } else {
            allCards.forEach(card => {
                if (card.dataset.status === currentFilter) {
                    card.style.display = 'block';
                } else {
                    card.style.display = 'none';
                }
            });
        }

        // Check if empty
        const visibleCards = Array.from(allCards).filter(card => card.style.display !== 'none');
        const emptyState = document.getElementById('emptyState');
        emptyState.style.display = visibleCards.length === 0 ? 'block' : 'none';
    });
});

// ============================================
// READY FOR PICKUP SECTION
// ============================================

let pickupOrdersListener = null;
const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds

// Listen to orders ready for pickup (completed but not received)
function listenToPickupOrders() {
    console.log('📋 Setting up pickup orders listener...');

    // Try with orderBy first (may need index)
    let query = db.collection('orders')
        .where('orderStatus', '==', 'completed')
        .where('paymentStatus', '==', 'paid');

    // Try adding orderBy (may fail if no index)
    try {
        pickupOrdersListener = query
            .orderBy('updatedAt', 'desc')
            .limit(20)
            .onSnapshot((snapshot) => {
                
                // === NEW LOGIC: INSTANTLY REMOVE CARDS WHEN CUSTOMER PICKS UP ===
                snapshot.docChanges().forEach((change) => {
                    // If order is removed (deleted by customer or barista)
                    if (change.type === 'removed') {
                        const card = document.getElementById(`pickup-card-${change.doc.id}`);
                        if (card) {
                            console.log(`🗑️ Order ${change.doc.id} removed from DB, removing card.`);
                            card.remove();
                        }
                    }
                    // If order is modified (e.g., receivedAt added)
                    if (change.type === 'modified') {
                        const data = change.doc.data();
                        if (data.receivedAt) {
                            const card = document.getElementById(`pickup-card-${change.doc.id}`);
                            if (card) {
                                console.log(`✅ Order ${change.doc.id} marked received by customer, removing card.`);
                                card.remove();
                            }
                        }
                    }
                });
                // ==============================================================

                console.log(`📦 Received ${snapshot.size} completed orders from Firestore`);
                const orders = [];

                snapshot.forEach((doc) => {
                    const data = doc.data();
                    
                    // Only show orders that haven't been received yet
                    if (!data.receivedAt) {
                        orders.push({
                            id: doc.id,
                            ...data
                        });
                    }
                });

                console.log(`✅ Displaying ${orders.length} pickup orders (after filtering receivedAt)`);
                displayPickupOrders(orders);

                // Auto-expire old orders (more than 1 hour)
                autoExpireOrders(orders);
            }, (error) => {
                console.error('❌ Error listening to pickup orders:', error);
                
                // If error is due to missing index, try without orderBy
                if (error.code === 'failed-precondition' || error.message.includes('index')) {
                    console.log('🔄 Retrying without orderBy...');
                    listenToPickupOrdersSimple();
                }
            });
    } catch (e) {
        console.error('❌ Error setting up listener:', e);
        listenToPickupOrdersSimple();
    }
}

// Fallback: Listen without orderBy (no index required)
function listenToPickupOrdersSimple() {
    console.log('📋 Setting up SIMPLE pickup orders listener (no orderBy)...');

    pickupOrdersListener = db.collection('orders')
        .where('orderStatus', '==', 'completed')
        .where('paymentStatus', '==', 'paid')
        .limit(20)
        .onSnapshot((snapshot) => {
            
            // === NEW LOGIC: INSTANTLY REMOVE CARDS ===
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'removed') {
                    const card = document.getElementById(`pickup-card-${change.doc.id}`);
                    if (card) card.remove();
                }
                if (change.type === 'modified') {
                    const data = change.doc.data();
                    if (data.receivedAt) {
                        const card = document.getElementById(`pickup-card-${change.doc.id}`);
                        if (card) card.remove();
                    }
                }
            });
            // ========================================

            console.log(`📦 Received ${snapshot.size} completed orders (simple query)`);
            const orders = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                
                // Only show orders that haven't been received yet
                if (!data.receivedAt) {
                    orders.push({
                        id: doc.id,
                        ...data
                    });
                }
            });

            console.log(`✅ Displaying ${orders.length} pickup orders`);
            displayPickupOrders(orders);

            // Auto-expire old orders (more than 1 hour)
            autoExpireOrders(orders);
        }, (error) => {
            console.error('❌ CRITICAL: Even simple query failed:', error);
        });
}

// Display pickup orders with "Mark as Received" button
function displayPickupOrders(orders) {
    const pickupGrid = document.getElementById('pickupOrdersGrid');
    const emptyState = document.getElementById('pickupEmptyState');

    if (orders.length === 0) {
        emptyState.style.display = 'block';
        pickupGrid.innerHTML = '';
        pickupGrid.appendChild(emptyState);
        return;
    }

    emptyState.style.display = 'none';
    pickupGrid.innerHTML = '';

    orders.forEach(order => {
        const orderCard = createPickupOrderCard(order);
        pickupGrid.appendChild(orderCard);
    });
}

// Create order card for pickup section
function createPickupOrderCard(order) {
    const card = document.createElement('div');
    card.className = 'order-card completed';
    card.dataset.orderId = order.id;

    // IMPORTANT: Add ID to element so we can remove it immediately later
    card.id = `pickup-card-${order.id}`;

    // Calculate time since completion
    const completedTime = order.updatedAt ? order.updatedAt.toDate() : new Date();
    const timeSince = getTimeSince(completedTime);
    const isOld = (Date.now() - completedTime.getTime()) > ONE_HOUR;

    // First item details
    const firstItem = order.items && order.items.length > 0 ? order.items[0] : null;
    const totalItems = order.items ? order.items.length : 0;

    card.innerHTML = `
        <div class="order-header">
            <div class="pickup-number" style="background: ${isOld ? '#f39c12' : '#27ae60'}; padding: 8px 16px; border-radius: 8px; display: inline-block;">
                <h3 style="color: white; margin: 0; font-size: 24px;">#${order.pickupNumber || '0000'}</h3>
            </div>
            <span class="order-time" style="color: ${isOld ? '#f39c12' : '#666'};">${timeSince}</span>
        </div>

        <div class="order-details">
            <div class="customer-info">
                <strong>${order.userName || 'Customer'}</strong>
            </div>

            ${firstItem ? `
            <div class="order-items">
                <p><strong>${firstItem.coffeeName}</strong></p>
                <p style="color: #666; font-size: 14px;">${firstItem.variant}${firstItem.size ? ` | ${firstItem.size}` : ''}${firstItem.customizations ? ` | ${firstItem.customizations}` : ''}</p>
                ${totalItems > 1 ? `<p style="color: #666; font-size: 14px;">+${totalItems - 1} more item(s)</p>` : ''}
            </div>
            ` : ''}

            <div class="order-total">
                <strong>RM ${(order.totalAmount || 0).toFixed(2)}</strong>
            </div>
        </div>

        <div class="order-actions" style="margin-top: 12px;">
            <button class="btn-mark-received ${isOld ? 'urgent' : ''}" onclick="markAsReceived('${order.id}', '${order.pickupNumber}')">
                ${isOld ? '⚠️ Mark as Received (>1h)' : '✅ Mark as Received'}
            </button>
        </div>
    `;

    return card;
}

// Mark order as received (manual by barista)
// Make this function global so it can be called from onclick
window.markAsReceived = async function markAsReceived(orderId, pickupNumber) {
    if (!confirm(`Confirm that customer picked up order #${pickupNumber}?`)) {
        return;
    }

    console.log(`📦 Marking order ${orderId} as received...`);

    try {
        const receivedTimestamp = firebase.firestore.Timestamp.now();
        const updates = {
            receivedAt: receivedTimestamp,
            updatedAt: receivedTimestamp,
            receivedBy: 'barista', // Mark that barista confirmed it
            baristaId: currentUser ? currentUser.uid : null
        };

        // Update in completed_orders collection
        await db.collection('completed_orders')
            .doc(orderId)
            .set(updates, { merge: true });

        // Update in orders collection (if still exists)
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (orderDoc.exists) {
            await orderRef.update(updates);

            // Delete from orders collection after marking as received
            await orderRef.delete();
            console.log('✅ Order deleted from orders collection');
        }

        // ========================================================
        // REMOVE CARD FROM UI IMMEDIATELY
        // ========================================================
        const cardToRemove = document.getElementById(`pickup-card-${orderId}`);
        if (cardToRemove) {
            cardToRemove.remove();
        }

        // Check if grid is empty to show empty state
        const pickupGrid = document.getElementById('pickupOrdersGrid');
        const remainingCards = pickupGrid.querySelectorAll('.order-card');
        const emptyState = document.getElementById('pickupEmptyState');

        if (remainingCards.length === 0 && emptyState) {
            emptyState.style.display = 'block';
            pickupGrid.appendChild(emptyState);
        }
        // ========================================================

        console.log('✅ Order marked as received successfully');
        // alert(`Order #${pickupNumber} marked as received!`);

    } catch (error) {
        console.error('❌ Error marking order as received:', error);
        alert('Failed to mark order as received. Please try again.');
    }
};

// Auto-expire orders older than 1 hour
async function autoExpireOrders(orders) {
    const now = Date.now();

    for (const order of orders) {
        if (!order.updatedAt) continue;

        const completedTime = order.updatedAt.toDate().getTime();
        const timeSinceCompletion = now - completedTime;

        // If more than 1 hour, auto-mark as received
        if (timeSinceCompletion > ONE_HOUR && !order.autoExpired) {
            console.log(`⏰ Auto-expiring order ${order.id} (${order.pickupNumber}) - ${Math.floor(timeSinceCompletion / 60000)} minutes old`);

            try {
                const receivedTimestamp = firebase.firestore.Timestamp.now();
                const updates = {
                    receivedAt: receivedTimestamp,
                    updatedAt: receivedTimestamp,
                    receivedBy: 'auto-expire', // Mark as auto-expired
                    autoExpired: true
                };

                // Update completed_orders
                await db.collection('completed_orders')
                    .doc(order.id)
                    .set(updates, { merge: true });

                // Update and delete from orders
                const orderRef = db.collection('orders').doc(order.id);
                const orderDoc = await orderRef.get();

                if (orderDoc.exists) {
                    await orderRef.update(updates);
                    await orderRef.delete();
                }

                console.log(`✅ Order ${order.pickupNumber} auto-expired after 1 hour`);
            } catch (error) {
                console.error(`❌ Error auto-expiring order ${order.id}:`, error);
            }
        }
    }
}

// Helper: Get time since completion
function getTimeSince(date) {
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);

    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes} mins ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
}

// Logout function
async function handleLogout() {
    if (!confirm('Are you sure you want to logout?')) return;

    try {
        // Remove listeners
        if (ordersListener) {
            ordersListener();
        }
        if (pickupOrdersListener) {
            pickupOrdersListener();
        }

        await auth.signOut();
        window.location.href = '../index.html';
    } catch (error) {
        console.error('Logout error:', error);
        alert('Failed to logout. Please try again.');
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (ordersListener) {
        ordersListener();
    }
    if (pickupOrdersListener) {
        pickupOrdersListener();
    }
});

console.log('Barista dashboard loaded');
