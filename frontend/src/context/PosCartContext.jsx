import { createContext, useContext, useState, useEffect, useMemo } from 'react';

const PosCartContext = createContext(null);
const STORAGE_KEY = 'mch_pos_cart_v2';

export function PosCartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.cart) ? parsed.cart : [];
    } catch {
      return [];
    }
  });

  const [orderMeta, setOrderMeta] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.orderMeta || {
        orderType: 'dine_in',
        tableId: '',
        tableCode: '',
        customerName: '',
        customerPhone: '',
        note: '',
      };
    } catch {
      return {
        orderType: 'dine_in',
        tableId: '',
        tableCode: '',
        customerName: '',
        customerPhone: '',
        note: '',
      };
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cart, orderMeta }));
    } catch {
      // ignore storage quota errors
    }
  }, [cart, orderMeta]);

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
