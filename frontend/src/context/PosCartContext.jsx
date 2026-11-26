import { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from './AuthContext';

const PosCartContext = createContext(null);
const EMPTY_META = {
  orderType: 'dine_in',
  tableId: '',
  tableCode: '',
  customerName: '',
  customerPhone: '',
  note: '',
};

const readStoredCart = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return {
      cart: Array.isArray(parsed?.cart) ? parsed.cart : [],
      orderMeta: parsed?.orderMeta ? { ...EMPTY_META, ...parsed.orderMeta } : { ...EMPTY_META },
    };
  } catch {
    return { cart: [], orderMeta: { ...EMPTY_META } };
  }
};

export function PosCartProvider({ children }) {
  const { user } = useAuth();
  const storageKey = user?.id ? `mch_pos_cart_u${user.id}` : 'mch_pos_cart_guest';
  const loadedKeyRef = useRef(storageKey);

  const [cart, setCart] = useState(() => readStoredCart(storageKey).cart);
  const [orderMeta, setOrderMeta] = useState(() => readStoredCart(storageKey).orderMeta);

  // Nạp lại giỏ hàng cô lập mỗi khi đổi tài khoản nhân sự
  useEffect(() => {
    const nextState = readStoredCart(storageKey);
    loadedKeyRef.current = storageKey;
    setCart(nextState.cart);
    setOrderMeta(nextState.orderMeta);
  }, [storageKey]);

  // Chỉ ghi localStorage sau khi đã hydrate đúng key hiện tại (tránh ghi đè giỏ khi chuyển tài khoản)
  useEffect(() => {
    if (loadedKeyRef.current !== storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ cart, orderMeta }));
    } catch {
      // ignore storage quota errors
    }
  }, [cart, orderMeta, storageKey]);

  // Thêm món vào giỏ hàng (gom chung nếu trùng sản phẩm + size + ghi chú)
  const addItem = (product, sizeObj, quantity = 1, note = '') => {
    const cleanNote = String(note || '').trim();
    const sizeId = sizeObj?.id || null;
    const sizeName = sizeObj?.name || sizeObj?.size || 'M';
    const unitPrice = Number(sizeObj?.price ?? product.price ?? 0);
    const key = `${product.id}-${sizeId || sizeName}-${cleanNote}`;

    setCart((prev) => {
      const idx = prev.findIndex((it) => it.key === key);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + quantity };
        return next;
      }
      return [
        ...prev,
        {
          key,
          product_id: product.id,
          product_size_id: sizeId,
          code: product.code || '',
          name: product.name,
          size_name: sizeName,
          price: unitPrice,
          quantity,
          note: cleanNote,
          image_url: product.image_url || '',
        },
      ];
    });
  };

  const updateQty = (key, delta) => {
    setCart((prev) =>
      prev
        .map((it) => (it.key === key ? { ...it, quantity: it.quantity + delta } : it))
        .filter((it) => it.quantity > 0)
    );
  };

  const updateItemNote = (key, nextNote) => {
    setCart((prev) =>
      prev.map((it) => (it.key === key ? { ...it, note: nextNote } : it))
    );
  };

  const removeItem = (key) => {
    setCart((prev) => prev.filter((it) => it.key !== key));
  };

  const clearCart = () => {
    setCart([]);
    setOrderMeta((prev) => ({ ...prev, note: '' }));
  };

  const resetAll = () => {
    setCart([]);
    setOrderMeta({
      orderType: 'dine_in',
      tableId: '',
      tableCode: '',
      customerName: '',
      customerPhone: '',
      note: '',
    });
  };

  const updateMeta = (patch) => {
    setOrderMeta((prev) => ({ ...prev, ...patch }));
  };

  const getProductQty = (productId) =>
    cart.filter((it) => it.product_id === productId).reduce((s, it) => s + it.quantity, 0);

  const summary = useMemo(() => {
    const totalItems = cart.reduce((s, it) => s + it.quantity, 0);
    const subtotal = cart.reduce((s, it) => s + it.price * it.quantity, 0);
    return { totalItems, subtotal };
  }, [cart]);

  return (
    <PosCartContext.Provider
      value={{
        cart,
        orderMeta,
        summary,
        addItem,
        updateQty,
        updateItemNote,
        removeItem,
        clearCart,
        resetAll,
        updateMeta,
        getProductQty,
      }}
    >
      {children}
    </PosCartContext.Provider>
  );
}

export const usePosCart = () => {
  const ctx = useContext(PosCartContext);
  if (!ctx) throw new Error('usePosCart must be used inside PosCartProvider');
  return ctx;
};
