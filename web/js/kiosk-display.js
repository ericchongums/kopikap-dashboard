// Kiosk Display - Real-time Order Status Display
// Shows preparing orders and ready to pickup orders side-by-side

let preparingOrdersListener = null;
let completedOrdersListener = null;

// Initialize kiosk display
function initKioskDisplay() {
    console.log('🚀 Initializing kiosk display...');

    // Check if Firebase is loaded
    if (typeof firebase === 'undefined') {
        console.error('❌ Firebase is not loaded!');
        return;
    }

    // Check if db is available
    if (typeof db === 'undefined' || db === null) {
        console.error('❌ Firestore db is not initialized!');
        console.error('Make sure firebase-config.js loaded before this script');
        return;
    }

    console.log('✅ Firebase initialized successfully');
    console.log('✅ Firestore db available:', !!db);

    // Start listening to orders
    listenToPreparingOrders();
    listenToCompletedOrders();

    // Refresh display every 30 seconds to prevent stale data
    setInterval(() => {
        console.log('🔄 Refreshing kiosk display...');
    }, 30000);
}

// Listen to preparing orders (orderStatus = 'preparing')
function listenToPreparingOrders() {
    console.log('📋 Setting up preparing orders listener...');

    // Try with orderBy first (requires index)
    let query = db.collection('orders')
        .where('orderStatus', '==', 'preparing')
        .where('paymentStatus', '==', 'paid');

    // Try to add orderBy (may fail if no index)
    try {
        query = query.orderBy('createdAt', 'asc');
        console.log('✅ Using query with orderBy(createdAt)');
    } catch (e) {
        console.warn('⚠️ orderBy not available, using basic query');
    }

    preparingOrdersListener = query.onSnapshot((snapshot) => {
        console.log(`📦 Received ${snapshot.size} preparing orders from Firestore`);
        const orders = [];

        snapshot.forEach((doc) => {
            const data = doc.data();
            console.log(`   Order ${doc.id}: pickup=${data.pickupNumber}, status=${data.orderStatus}`);
            orders.push({
                id: doc.id,
                pickupNumber: data.pickupNumber,
                createdAt: data.createdAt
            });
        });

        console.log(`✅ Displaying ${orders.length} preparing orders`);
        displayPreparingOrders(orders);
    }, (error) => {
        console.error('❌ Error listening to preparing orders:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        // If error is due to missing index, try without orderBy
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
            console.log('🔄 Retrying without orderBy...');
            listenToPreparingOrdersSimple();
        }
    });
}

// Fallback: Listen to preparing orders without orderBy (no index required)
function listenToPreparingOrdersSimple() {
    console.log('📋 Setting up SIMPLE preparing orders listener (no orderBy)...');

    preparingOrdersListener = db.collection('orders')
        .where('orderStatus', '==', 'preparing')
        .where('paymentStatus', '==', 'paid')
        .onSnapshot((snapshot) => {
            console.log(`📦 Received ${snapshot.size} preparing orders from Firestore (simple query)`);
            const orders = [];

            snapshot.forEach((doc) => {
                const data = doc.data();
                console.log(`   Order ${doc.id}: pickup=${data.pickupNumber}`);
                orders.push({
                    id: doc.id,
                    pickupNumber: data.pickupNumber,
                    createdAt: data.createdAt
                });
            });

            console.log(`✅ Displaying ${orders.length} preparing orders`);
            displayPreparingOrders(orders);
        }, (error) => {
            console.error('❌ CRITICAL: Even simple query failed:', error);
        });
}

// Listen to completed orders (orderStatus = 'completed', ready for pickup)
// Automatically hides orders when customer marks as received (order gets deleted from 'orders' collection)
function listenToCompletedOrders() {
    console.log('📋 Setting up completed orders listener...');

    // Try with orderBy first
    let query = db.collection('orders')
        .where('orderStatus', '==', 'completed')
        .where('paymentStatus', '==', 'paid');

    // Try to add orderBy and limit
    try {
        query = query.orderBy('updatedAt', 'desc').limit(20);
        console.log('✅ Using query with orderBy(updatedAt) and limit(20)');
    } catch (e) {
        console.warn('⚠️ orderBy not available, using basic query with limit');
        query = query.limit(20);
    }

    completedOrdersListener = query.onSnapshot((snapshot) => {
        console.log(`📦 Received ${snapshot.size} completed orders from Firestore`);
        const orders = [];

        snapshot.forEach((doc) => {
            const data = doc.data();

            // Only show orders that haven't been received yet
            // When customer clicks "Order Received", the order is deleted from 'orders' collection
            // So this listener will automatically remove it from the display
            if (!data.receivedAt) {
                console.log(`   Order ${doc.id}: pickup=${data.pickupNumber}, status=${data.orderStatus}`);
                orders.push({
                    id: doc.id,
                    pickupNumber: data.pickupNumber,
                    updatedAt: data.updatedAt
                });
            }
        });

        console.log(`✅ Displaying ${orders.length} ready to pickup orders`);
        displayPickupOrders(orders);
    }, (error) => {
        console.error('❌ Error listening to completed orders:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);

        // If error is due to missing index, try without orderBy
        if (error.code === 'failed-precondition' || error.message.includes('index')) {
            console.log('🔄 Retrying without orderBy...');
            listenToCompletedOrdersSimple();
        }
    });
}

// Fallback: Listen to completed orders without orderBy (no index required)
function listenToCompletedOrdersSimple() {
    console.log('📋 Setting up SIMPLE completed orders listener (no orderBy)...');

    completedOrdersListener = db.collection('orders')
        .where('orderStatus', '==', 'completed')
        .where('paymentStatus', '==', 'paid')
        .limit(20)
        .onSnapshot((snapshot) => {
            console.log(`📦 Received ${snapshot.size} completed orders from Firestore (simple query)`);
            const orders = [];

            snapshot.forEach((doc) => {
                const data = doc.data();

                // Only show orders that haven't been received yet
                if (!data.receivedAt) {
                    console.log(`   Order ${doc.id}: pickup=${data.pickupNumber}`);
                    orders.push({
                        id: doc.id,
                        pickupNumber: data.pickupNumber,
                        updatedAt: data.updatedAt
                    });
                }
            });

            console.log(`✅ Displaying ${orders.length} ready to pickup orders`);
            displayPickupOrders(orders);
        }, (error) => {
            console.error('❌ CRITICAL: Even simple query failed:', error);
        });
}

// Display preparing orders
function displayPreparingOrders(orders) {
    const container = document.getElementById('preparingOrders');

    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state">No orders preparing</div>';
        return;
    }

    // Get existing order numbers to detect new ones
    const existingOrders = Array.from(container.querySelectorAll('.order-number'))
        .map(el => el.dataset.orderId);

    container.innerHTML = '';

    orders.forEach((order) => {
        const orderElement = document.createElement('div');
        orderElement.className = 'order-number';
        orderElement.dataset.orderId = order.id;

        // Format pickup number with leading #
        const pickupNumber = order.pickupNumber || '0000';
        orderElement.textContent = `#${pickupNumber}`;

        // Add animation for new orders
        if (!existingOrders.includes(order.id)) {
            orderElement.classList.add('new');

            // Add pulse effect after slide-in
            setTimeout(() => {
                orderElement.classList.add('pulse');
            }, 600);

            // Remove pulse class after animation
            setTimeout(() => {
                orderElement.classList.remove('pulse');
            }, 1100);
        }

        container.appendChild(orderElement);
    });
}

// Display ready to pickup orders
function displayPickupOrders(orders) {
    const container = document.getElementById('pickupOrders');

    if (orders.length === 0) {
        container.innerHTML = '<div class="empty-state">No orders ready</div>';
        return;
    }

    // Get existing order numbers to detect new ones
    const existingOrders = Array.from(container.querySelectorAll('.order-number'))
        .map(el => el.dataset.orderId);

    container.innerHTML = '';

    orders.forEach((order) => {
        const orderElement = document.createElement('div');
        orderElement.className = 'order-number';
        orderElement.dataset.orderId = order.id;

        // Format pickup number with leading #
        const pickupNumber = order.pickupNumber || '0000';
        orderElement.textContent = `#${pickupNumber}`;

        // Add animation for new orders
        if (!existingOrders.includes(order.id)) {
            orderElement.classList.add('new');

            // Add pulse effect after slide-in
            setTimeout(() => {
                orderElement.classList.add('pulse');
            }, 600);

            // Remove pulse class after animation
            setTimeout(() => {
                orderElement.classList.remove('pulse');
            }, 1100);
        }

        container.appendChild(orderElement);
    });
}

// Initialize with retry mechanism (in case firebase-config.js hasn't loaded yet)
function initWithRetry(attempts = 0) {
    if (attempts > 10) {
        console.error('❌ Failed to initialize after 10 attempts');
        return;
    }

    if (typeof firebase === 'undefined' || typeof db === 'undefined' || db === null) {
        console.log(`⏳ Waiting for Firebase to initialize... (attempt ${attempts + 1})`);
        setTimeout(() => initWithRetry(attempts + 1), 100);
        return;
    }

    initKioskDisplay();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWithRetry);
} else {
    initWithRetry();
}

// Cleanup listeners on page unload
window.addEventListener('beforeunload', () => {
    if (preparingOrdersListener) {
        preparingOrdersListener();
    }
    if (completedOrdersListener) {
        completedOrdersListener();
    }
});

console.log('Kiosk display script loaded');
