import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Coffee,
  Users,
  Calendar,
  ShoppingBag,
  RefreshCw,
  MapPin,
  Plus,
  Clock,
  User,
  Phone,
  Search,
  X,
  Sparkles,
  Armchair,
  CheckCircle2,
  Trash2,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import api from '../api/axios';
import socket from '../api/socket';
import { playNotificationSound } from '../utils/sound';
import toast from 'react-hot-toast';

// Cấu hình màu sắc & nhãn cho trạng thái bàn
const STATUS_CFG = {
  empty: {
    label: 'Trống',
    color: '#34d399',
    strip: '#10b981',
    badgeBg: 'rgba(16, 185, 129, 0.12)',
    badgeBorder: 'rgba(16, 185, 129, 0.35)',
  },
  occupied: {
    label: 'Đang phục vụ',
    color: '#f87171',
    strip: '#ef4444',
    badgeBg: 'rgba(239, 68, 68, 0.14)',
    badgeBorder: 'rgba(239, 68, 68, 0.4)',
  },
  reserved: {
    label: 'Đã đặt trước',
    color: '#fbbf24',
    strip: '#f59e0b',
    badgeBg: 'rgba(245, 158, 11, 0.14)',
    badgeBorder: 'rgba(245, 158, 11, 0.4)',
  },
  disabled: {
    label: 'Tạm khóa',
    color: '#94a3b8',
    strip: '#64748b',
    badgeBg: 'rgba(148, 163, 184, 0.1)',
    badgeBorder: 'rgba(148, 163, 184, 0.3)',
  },
};

const NL = { fontVariantNumeric: 'lining-nums tabular-nums' };

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

// Rút gọn tên khu vực để không bị tràn dòng
const shortArea = (name = '') => {
  if (!name) return '';
  return name.replace(/\s*-\s*.*$/, '').trim();
};

// Tính thời gian đếm ngược đặt bàn
const countdown = (resTime) => {
  if (!resTime) return null;
  const parts = String(resTime).split(':');
  if (parts.length < 2) return null;
  const target = new Date();
  target.setHours(Number(parts[0]), Number(parts[1]), 0, 0);
  const diffMins = Math.round((target - new Date()) / 60000);
  if (diffMins > 0) return `Còn ${diffMins} phút`;
  if (diffMins < 0 && diffMins > -120) return `Quá hẹn ${Math.abs(diffMins)} phút`;
  return null;
};

// Tính thời gian khách đã ngồi
const seatedMins = (openedAt) => {
  if (!openedAt) return null;
  const mins = Math.round((new Date() - new Date(openedAt)) / 60000);
  if (mins < 1) return 'Vừa vào';
  if (mins < 60) return `Ngồi ${mins} phút`;
  return `Ngồi ${Math.floor(mins / 60)}h ${mins % 60}m`;
};

// ==========================================
// SUB-COMPONENTS
// ==========================================

// 1. KPI Card theo chuẩn trang Thống kê (Cắt góc bo mượt mà, không bao giờ bị thừa góc)
function KpiCard({ icon: Icon, iconColor, iconBg, label, value, unit, subtitle, active, onClick, borderStrip }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      className="mockup-panel"
      style={{
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: '12px',
        position: 'relative',
        overflow: 'hidden',
        border: active ? '1.5px solid #d97706' : '1px solid #3d2618',
        background: active ? 'rgba(217, 119, 6, 0.14)' : '#1c120b',
        boxShadow: active ? '0 0 16px rgba(217, 119, 6, 0.2)' : '0 4px 16px rgba(0, 0, 0, 0.35)',
        transition: 'all 0.2s ease',
        userSelect: 'none',
      }}
      onKeyDown={(e) => e.key === 'Enter' && onClick && onClick()}
    >
      {/* Vạch màu chỉ trạng thái cắt sạch sẽ bằng overflow hidden */}
      {borderStrip && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '4px',
            backgroundColor: borderStrip,
          }}
        />
      )}

      <div
        style={{
          width: '44px',
          height: '44px',
          borderRadius: '10px',
          background: iconBg || 'rgba(245, 158, 11, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={22} color={iconColor || '#fbbf24'} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.74rem',
            fontWeight: 700,
            color: '#c4a482',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '2px',
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: '1.55rem',
            fontWeight: 900,
            color: iconColor || '#fef3c7',
            lineHeight: 1.1,
            ...NL,
          }}
        >
          {value}{' '}
          {unit && (
            <span style={{ fontSize: '0.85rem', color: '#c4a482', fontWeight: 500 }}>
              {unit}
            </span>
          )}
        </div>
        {subtitle && (
          <div
            style={{
              fontSize: '0.72rem',
              color: '#a88265',
              marginTop: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

// 2. Chip Lọc theo chuẩn POS
function FilterChip({ active, label, count, onClick, dotColor }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-sm"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        borderRadius: '8px',
        fontWeight: 700,
        fontSize: '0.8rem',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        background: active ? 'linear-gradient(135deg, #d97706, #b45309)' : '#24160e',
        color: active ? '#ffffff' : '#d5bba2',
        border: active ? '1.5px solid #fbbf24' : '1px solid #4a2c18',
        boxShadow: active ? '0 2px 8px rgba(217, 119, 6, 0.35)' : 'none',
      }}
    >
      {dotColor && (
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: dotColor,
            display: 'inline-block',
            boxShadow: `0 0 6px ${dotColor}`,
          }}
        />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span
          style={{
            fontSize: '0.72rem',
            padding: '1px 6px',
            borderRadius: '10px',
            background: active ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.08)',
            color: active ? '#fff' : '#c4a482',
            ...NL,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// 3. Status Badge với chấm tròn + chữ
function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.empty;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: cfg.badgeBg,
        color: cfg.color,
        fontSize: '0.74rem',
        fontWeight: 700,
        padding: '3px 9px',
        borderRadius: '12px',
        border: `1px solid ${cfg.badgeBorder}`,
        letterSpacing: '0.02em',
      }}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          backgroundColor: cfg.color,
          display: 'inline-block',
          boxShadow: `0 0 5px ${cfg.color}`,
        }}
      />
      {cfg.label}
    </span>
  );
}

// 4. Skeleton Card khi Loading
function SkeletonCard() {
  return (
    <div
      className="mockup-panel"
      style={{
        padding: '16px',
        borderRadius: '12px',
        minHeight: '220px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'rgba(26, 15, 8, 0.6)',
        border: '1px solid rgba(245, 158, 11, 0.08)',
        animation: 'pulse 1.8s infinite',
      }}
    >
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ width: '80px', height: '22px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px' }} />
          <div style={{ width: '70px', height: '20px', background: 'rgba(255,255,255,0.06)', borderRadius: '10px' }} />
        </div>
        <div style={{ width: '120px', height: '14px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }} />
      </div>
      <div style={{ height: '70px', background: 'rgba(0,0,0,0.25)', borderRadius: '8px' }} />
      <div style={{ height: '36px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px' }} />
    </div>
  );
}

// 5. Nút Outline chuyển Solid khi Hover
function BtnOutlineHover({
  children,
  onClick,
  borderColor,
  color,
  hoverBg,
  hoverColor = '#ffffff',
  style,
  title,
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="btn btn-sm"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1.5px solid ${borderColor}`,
        background: hovered ? hoverBg : 'transparent',
        color: hovered ? hoverColor : color,
        fontWeight: 700,
        fontSize: '0.8rem',
        padding: '8px 12px',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// 6. Thẻ Bàn (Table Card) - Chuẩn hóa khung chung 4 hàng, bo góc mượt mà chuyên nghiệp như POS
function TableCard({
  table,
  onOpenToPos,
  onFreeTable,
  onCheckIn,
  onCancelReserve,
}) {
  const cfg = STATUS_CFG[table.status] || STATUS_CFG.empty;
  const isEmpty = table.status === 'empty';
  const isOccupied = table.status === 'occupied';
  const isReserved = table.status === 'reserved';

  const cdText = isReserved ? countdown(table.reservation_time) : null;
  const sitText = isOccupied ? seatedMins(table.current_order_time) : null;

  // SỬA LỖI BÀN 10: Đọc chính xác dữ liệu từ server, không fallback sai
  const itemCount = Number(table.current_item_count ?? 0);
  const orderTotal = Number(table.current_order_total ?? 0);

  return (
    <div
      className="mockup-panel"
      style={{
        padding: '16px',
        borderRadius: '12px',
        position: 'relative',
        overflow: 'hidden',
        border: isOccupied
          ? '1.5px solid rgba(239, 68, 68, 0.55)'
          : isReserved
          ? '1.5px solid rgba(245, 158, 11, 0.55)'
          : '1px solid #3d2618',
        background: isOccupied
          ? 'linear-gradient(145deg, rgba(38, 16, 12, 0.95), rgba(24, 12, 8, 0.95))'
          : isReserved
          ? 'linear-gradient(145deg, rgba(38, 26, 10, 0.95), rgba(24, 15, 6, 0.95))'
          : '#1c120b',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: '220px',
        gap: '10px',
        boxShadow: isOccupied
          ? '0 6px 20px rgba(239, 68, 68, 0.15)'
          : isReserved
          ? '0 6px 20px rgba(245, 158, 11, 0.15)'
          : '0 4px 16px rgba(0, 0, 0, 0.35)',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Vạch màu chỉ trạng thái bên trái được clip hoàn hảo trong bo góc 12px, KHÔNG BAO GIỜ bị thừa góc */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: '4px',
          backgroundColor: cfg.strip,
        }}
      />

      {/* HÀNG 1: Tên bàn kiểu badge POS + Badge trạng thái */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span
            style={{
              fontSize: '0.92rem',
              fontWeight: 900,
              color: '#fbbf24',
              background: 'rgba(251, 191, 36, 0.12)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(251, 191, 36, 0.25)',
              letterSpacing: '0.5px',
              fontFamily: "'Playfair Display', Georgia, serif",
              ...NL,
            }}
          >
            {table.code}
          </span>
          <StatusBadge status={table.status} />
        </div>

        {/* HÀNG 2: Khu vực rút gọn · Số ghế */}
        <div
          style={{
            fontSize: '0.78rem',
            color: '#c4a482',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={`${table.area_name} • ${table.seats} ghế`}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={13} color="#a88265" />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '130px' }}>
              {shortArea(table.area_name)}
            </span>
          </span>
          <span style={{ color: '#5a341e' }}>•</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', ...NL }}>
            <Armchair size={13} color="#a88265" />
            <span>{table.seats} ghế</span>
          </span>
        </div>
      </div>

      {/* HÀNG 3 (THÂN): Chi tiết theo từng trạng thái */}
      <div
        style={{
          background: 'rgba(15, 8, 4, 0.65)',
          borderRadius: '8px',
          padding: '10px 12px',
          border: '1px solid rgba(245, 158, 11, 0.1)',
          minHeight: '74px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        {/* TRẠNG THÁI: TRỐNG (Tối giản, chuyên nghiệp) */}
        {isEmpty && (
          <div
            style={{
              textAlign: 'center',
              color: '#a88265',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Sparkles size={14} color="#34d399" />
            <span>Sẵn sàng đón khách</span>
          </div>
        )}

        {/* TRẠNG THÁI: ĐANG PHỤC VỤ (Nổi bật vừa phải, số liệu chuẩn xác) */}
        {isOccupied && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '0.8rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#c4a482' }}>Số món đang dùng:</span>
              <strong style={{ color: '#fef3c7', ...NL }}>
                {itemCount > 0 ? `${itemCount} món` : 'Đang chọn món'}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: '#c4a482' }}>Tạm tính:</span>
              <strong
                style={{
                  color: orderTotal > 0 ? '#fbbf24' : '#c4a482',
                  fontSize: '0.96rem',
                  fontWeight: 900,
                  ...NL,
                }}
              >
                {orderTotal > 0 ? fmt(orderTotal) : '0 đ'}
              </strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#a88265', marginTop: '2px' }}>
              <span>
                {table.customer_count > 0 ? `${table.customer_count} khách` : 'Khách tại bàn'}
              </span>
              {sitText && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#fbbf24' }}>
                  <Clock size={11} /> {sitText}
                </span>
              )}
            </div>
          </div>
        )}

        {/* TRẠNG THÁI: ĐÃ ĐẶT TRƯỚC */}
        {isReserved && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.78rem' }}>
            <div
              style={{
                color: '#fbbf24',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`${table.reservation_name || 'Khách đặt bàn'} (${table.reservation_phone || ''})`}
            >
              <User size={13} color="#fbbf24" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {table.reservation_name || 'Khách đặt bàn'}
              </span>
              {table.reservation_phone && (
                <span style={{ color: '#c4a482', fontSize: '0.72rem', fontWeight: 500, flexShrink: 0, ...NL }}>
                  ({table.reservation_phone})
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fef3c7' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} color="#fbbf24" />
                <strong style={{ ...NL }}>{table.reservation_time || '19:30'}</strong>
                <span style={{ color: '#c4a482', fontSize: '0.72rem' }}>
                  ({table.customer_count || 2} khách)
                </span>
              </span>
              {cdText && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: cdText.includes('Quá') ? '#f87171' : '#34d399',
                    ...NL,
                  }}
                >
                  {cdText}
                </span>
              )}
            </div>

            {table.reservation_note && (
              <div
                style={{
                  color: '#d5bba2',
                  fontStyle: 'italic',
                  fontSize: '0.72rem',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.25,
                }}
                title={table.reservation_note}
              >
                &ldquo;{table.reservation_note}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>

      {/* HÀNG 4 (CHÂN): Nút hành động chuẩn POS */}
      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        {isEmpty && (
          <button
            type="button"
            className="btn btn-sm"
            style={{
              flex: 1,
              background: '#15803d',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.82rem',
              padding: '7px 12px',
              borderRadius: '6px',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              cursor: 'pointer',
            }}
            onClick={() => onOpenToPos(table)}
          >
            <Coffee size={14} />
            <span>Mở bàn / Gọi món</span>
          </button>
        )}

        {isOccupied && (
          <>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                flex: 1,
                background: '#d97706',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.8rem',
                padding: '7px 12px',
                borderRadius: '6px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                cursor: 'pointer',
              }}
              onClick={() => onOpenToPos(table)}
              title="Gọi thêm món hoặc thanh toán tại quầy"
            >
              <Plus size={14} />
              <span>Thêm món</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => onFreeTable(table.id, table.code)}
              style={{
                background: '#24160e',
                borderColor: 'rgba(239, 68, 68, 0.45)',
                color: '#f87171',
                fontWeight: 700,
                fontSize: '0.78rem',
                padding: '7px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
              title="Dọn dẹp và trả bàn về trạng thái trống"
            >
              <Trash2 size={13} />
              <span>Trả bàn</span>
            </button>
          </>
        )}

        {isReserved && (
          <>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                flex: 1,
                background: '#15803d',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.8rem',
                padding: '7px 12px',
                borderRadius: '6px',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                cursor: 'pointer',
              }}
              onClick={() => onCheckIn(table)}
            >
              <CheckCircle2 size={14} />
              <span>Khách đã đến</span>
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => onCancelReserve(table.id, table.code)}
              style={{
                background: '#24160e',
                borderColor: 'rgba(239, 68, 68, 0.45)',
                color: '#f87171',
                fontWeight: 700,
                fontSize: '0.78rem',
                padding: '7px 12px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
              }}
              title="Hủy đặt bàn"
            >
              <X size={13} />
              <span>Hủy</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// 7. Nhóm bàn theo khu vực khi chọn "Tất cả"
function AreaGroup({ areaName, tables, onOpenToPos, onFreeTable, onCheckIn, onCancelReserve }) {
  const emptyCount = tables.filter((t) => t.status === 'empty').length;
  const occupiedCount = tables.filter((t) => t.status === 'occupied').length;
  const reservedCount = tables.filter((t) => t.status === 'reserved').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Tiêu đề khu vực: Tên · Số bàn · Số bàn trống */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(245, 158, 11, 0.15)',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={16} color="#d97706" />
          <h3
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 800,
              color: '#fef3c7',
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: '0.02em',
            }}
          >
            {areaName}
          </h3>
          <span style={{ color: '#a88265', fontSize: '0.82rem', ...NL }}>
            ({tables.length} bàn)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.78rem', ...NL }}>
          <span style={{ color: '#34d399' }}>● {emptyCount} trống</span>
          {occupiedCount > 0 && <span style={{ color: '#f87171' }}>● {occupiedCount} có khách</span>}
          {reservedCount > 0 && <span style={{ color: '#fbbf24' }}>● {reservedCount} đặt trước</span>}
        </div>
      </div>

      {/* Lưới bàn của khu vực */}
      <div
        className="table-card-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '14px',
        }}
      >
        {tables.map((table) => (
          <TableCard
            key={table.id}
            table={table}
            onOpenToPos={onOpenToPos}
            onFreeTable={onFreeTable}
            onCheckIn={onCheckIn}
            onCancelReserve={onCancelReserve}
          />
        ))}
      </div>
    </div>
  );
}

// ==========================================
// MAIN COMPONENT: TABLES (SƠ ĐỒ BÀN)
// ==========================================
export default function Tables() {
  const navigate = useNavigate();

  // State
  const [data, setData] = useState({ tables: [], areas: [] });
  const [selectedArea, setSelectedArea] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Modals state
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveTableTarget, setReserveTableTarget] = useState(null);
  const [reserveForm, setReserveForm] = useState({
    name: '',
    phone: '',
    time: '19:30',
    guests: 4,
    note: '',
  });

  // Tải dữ liệu bàn từ backend
  const loadTables = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await api.get('/tables');
      if (res.data?.data) {
        setData(res.data.data);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error('Lỗi tải danh sách bàn:', err);
      setLoadError('Không thể tải sơ đồ bàn. Vui lòng kiểm tra lại kết nối!');
    } finally {
      setLoading(false);
    }
  };

  // Tải đơn hàng online / mang về
  const loadOnlineOrders = async () => {
    try {
      const res = await api.get('/orders/all');
      const list = res.data?.data || [];
      const active = list.filter((o) =>
        ['takeaway', 'dine_in'].includes(o.order_type) &&
        ['scheduled', 'pending', 'preparing', 'open'].includes(o.status)
      );
      setOnlineOrders(active);
    } catch (err) {
      console.warn('Could not load online orders:', err);
    }
  };

  // Cập nhật trạng thái đơn online
  const handleUpdateOnlineStatus = async (orderId, targetStatus) => {
    try {
      await api.put(`/orders/${orderId}/status`, { status: targetStatus });
      toast.success(
        targetStatus === 'preparing'
          ? 'Đã chuyển sang: Đang pha chế'
          : 'Đã chuyển sang: Pha xong & Trả món'
      );
      loadOnlineOrders();
      loadTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi cập nhật trạng thái đơn');
    }
  };

  // Effects & Realtime Socket
  useEffect(() => {
    loadTables();
    loadOnlineOrders();

    const handleNewOrder = (payload) => {
      playNotificationSound();
      toast.success(`CÓ ĐƠN HÀNG ONLINE MỚI: #${payload?.orderCode || ''}!`, { duration: 6000 });
      loadTables();
      loadOnlineOrders();
    };

    const handleSync = () => {
      loadTables();
      loadOnlineOrders();
    };

    socket.on('order:created', handleNewOrder);
    socket.on('barista:new_order', handleSync);
    socket.on('order:status_updated', handleSync);
    socket.on('barista:item_updated', handleSync);
    socket.on('order:cancelled', handleSync);

    const interval = setInterval(() => {
      loadTables();
      loadOnlineOrders();
    }, 10000);

    return () => {
      clearInterval(interval);
      socket.off('order:created', handleNewOrder);
      socket.off('barista:new_order', handleSync);
      socket.off('order:status_updated', handleSync);
      socket.off('barista:item_updated', handleSync);
      socket.off('order:cancelled', handleSync);
    };
  }, []);

  // Mở bàn chuyển sang POS
  const handleOpenTableToPos = (table) => {
    let url = `/pos?table_id=${table.id}&table_code=${encodeURIComponent(table.code)}`;
    if (table.reservation_name) {
      url += `&customer_name=${encodeURIComponent(table.reservation_name)}`;
    }
    if (table.reservation_phone) {
      url += `&customer_phone=${encodeURIComponent(table.reservation_phone)}`;
    }
    navigate(url);
  };

  // Mở modal đặt bàn trước
  const handleOpenReserve = (table = null) => {
    setReserveTableTarget(table);
    setReserveForm({
      name: '',
      phone: '',
      time: '19:30',
      guests: table ? table.seats : 4,
      note: '',
    });
    setShowReserveModal(true);
  };

  // Lưu đặt bàn
  const handleSaveReservation = async (e) => {
    e.preventDefault();
    if (!reserveTableTarget) {
      toast.error('Vui lòng chọn bàn để đặt');
      return;
    }
    try {
      await api.post(`/tables/${reserveTableTarget.id}/reserve`, {
        reservation_name: reserveForm.name,
        reservation_phone: reserveForm.phone,
        reservation_time: reserveForm.time,
        reservation_note: reserveForm.note,
        customer_count: reserveForm.guests,
      });
      toast.success(`Đã đặt trước ${reserveTableTarget.code} cho khách ${reserveForm.name}!`);
      setShowReserveModal(false);
      loadTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Có lỗi khi đặt bàn');
    }
  };

  // Hủy đặt bàn
  const handleCancelReservation = async (tableId, tableCode) => {
    if (!window.confirm(`Xác nhận hủy đặt bàn ${tableCode}?`)) return;
    try {
      await api.post(`/tables/${tableId}/cancel-reservation`);
      toast.success(`Đã hủy đặt bàn ${tableCode}`);
      loadTables();
    } catch (err) {
      toast.error('Lỗi khi hủy đặt bàn');
    }
  };

  // Khách đặt bàn đã tới -> Nhận bàn
  const handleCheckInReservedTable = async (table) => {
    try {
      await api.put(`/tables/${table.id}/status`, { status: 'occupied' });
      toast.success(`Khách ${table.reservation_name || ''} đã nhận bàn ${table.code}!`);
      handleOpenTableToPos(table);
    } catch (err) {
      toast.error('Lỗi nhận bàn');
    }
  };

  // Trả bàn về trống
  const handleFreeTable = async (tableId, tableCode) => {
    if (!window.confirm(`Xác nhận dọn bàn và trả ${tableCode} về trạng thái TRỐNG?`)) return;
    try {
      await api.put(`/tables/${tableId}/status`, { status: 'empty' });
      toast.success(`Đã giải phóng ${tableCode} thành bàn Trống!`);
      loadTables();
    } catch (err) {
      toast.error('Lỗi khi đổi trạng thái bàn');
    }
  };

  // Xóa tất cả bộ lọc
  const clearAllFilters = () => {
    setSelectedArea('all');
    setStatusFilter('all');
    setSearchQuery('');
  };

  // Tính các chỉ số KPI
  const counts = useMemo(() => {
    const all = data.tables || [];
    return {
      total: all.length,
      empty: all.filter((t) => t.status === 'empty').length,
      occupied: all.filter((t) => t.status === 'occupied').length,
      reserved: all.filter((t) => t.status === 'reserved').length,
    };
  }, [data.tables]);

  // Giờ hẹn gần nhất
  const nearestRes = useMemo(() => {
    const list = (data.tables || [])
      .filter((t) => t.status === 'reserved' && t.reservation_time)
      .map((t) => t.reservation_time)
      .sort();
    return list[0] || null;
  }, [data.tables]);

  // Lọc bàn theo Khu vực, Trạng thái & Ô tìm kiếm
  const filteredTables = useMemo(() => {
    let list = data.tables || [];

    if (selectedArea !== 'all') {
      list = list.filter((t) => String(t.area_id) === String(selectedArea));
    }

    if (statusFilter !== 'all') {
      list = list.filter((t) => t.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.code.toLowerCase().includes(q) ||
          (t.area_name && t.area_name.toLowerCase().includes(q)) ||
          (t.reservation_name && t.reservation_name.toLowerCase().includes(q)) ||
          (t.reservation_phone && t.reservation_phone.includes(q))
      );
    }

    return list;
  }, [data.tables, selectedArea, statusFilter, searchQuery]);

  // Nhóm theo khu vực khi chọn "Tất cả" & không có tìm kiếm
  const groupedByArea = useMemo(() => {
    if (selectedArea !== 'all' || searchQuery.trim() !== '' || statusFilter !== 'all') {
      return null;
    }
    const groups = {};
    (data.areas || []).forEach((a) => {
      groups[a.id] = { name: a.name, tables: [] };
    });
    (data.tables || []).forEach((t) => {
      if (groups[t.area_id]) {
        groups[t.area_id].tables.push(t);
      } else {
        groups[t.area_id] = { name: t.area_name || 'Khu vực khác', tables: [t] };
      }
    });
    return Object.values(groups).filter((g) => g.tables.length > 0);
  }, [data.tables, data.areas, selectedArea, searchQuery, statusFilter]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* ========================================================
          A. PAGE HEADER (Tiêu đề + Cập nhật + Nút Đặt bàn + 1 Nút Làm mới)
          ======================================================== */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.75rem',
              fontWeight: 900,
              color: '#fef3c7',
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            SƠ ĐỒ BÀN
          </h1>
          <div
            style={{
              fontSize: '0.78rem',
              color: '#a88265',
              marginTop: '2px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              ...NL,
            }}
          >
            <Clock size={12} color="#a88265" />
            <span>
              Cập nhật lúc {lastUpdated.toLocaleTimeString('vi-VN')}
            </span>
            <span style={{ color: '#4a2c18' }}>•</span>
            <span style={{ color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  animation: 'blink-dot 1.5s infinite',
                }}
              />
              Trực tuyến sẵn sàng
            </span>
          </div>
        </div>

        {/* Cổng đặt món online dạng pill nhỏ gọn */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            onClick={() => {
              if (onlineOrders.length > 0) {
                const el = document.getElementById('online-orders-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
                else navigate('/orders');
              } else {
                navigate('/orders');
              }
            }}
            role="button"
            tabIndex={0}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: onlineOrders.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(26, 15, 8, 0.8)',
              border: onlineOrders.length > 0 ? '1px solid #f59e0b' : '1px solid rgba(245, 158, 11, 0.2)',
              fontSize: '0.76rem',
              color: onlineOrders.length > 0 ? '#fbbf24' : '#c4a482',
              cursor: 'pointer',
              userSelect: 'none',
              ...NL,
            }}
            title="Bấm để xem danh sách đơn online"
          >
            <ShoppingBag size={14} color={onlineOrders.length > 0 ? '#fbbf24' : '#10b981'} />
            <span>
              Cổng Online:{' '}
              <strong style={{ color: onlineOrders.length > 0 ? '#fbbf24' : '#34d399' }}>
                {onlineOrders.length > 0 ? `${onlineOrders.length} đơn chờ` : 'Đang hoạt động'}
              </strong>
            </span>
          </div>

          {/* Nút đặt bàn trước (màu cam chuẩn Thống kê) */}
          <button
            type="button"
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              borderColor: '#d97706',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.82rem',
              padding: '8px 16px',
              borderRadius: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(217, 119, 6, 0.3)',
              cursor: 'pointer',
            }}
            onClick={() => handleOpenReserve(null)}
          >
            <Plus size={16} />
            <span>ĐẶT BÀN TRƯỚC</span>
          </button>

          {/* NÚT LÀM MỚI DUY NHẤT (dạng icon + tooltip) */}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              loadTables();
              loadOnlineOrders();
            }}
            disabled={loading}
            title="Làm mới sơ đồ bàn và đơn online"
            style={{
              width: '38px',
              height: '38px',
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '8px',
              borderColor: '#4a2c18',
              color: '#d5bba2',
              cursor: 'pointer',
            }}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ========================================================
          B. HÀNG KPI (5 CHỈ SỐ - CHUẨN THỐNG KÊ)
          ======================================================== */}
      <div
        className="kpi-grid-5"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
        }}
      >
        <KpiCard
          icon={Coffee}
          iconColor="#fbbf24"
          iconBg="rgba(245, 158, 11, 0.12)"
          label="TỔNG SỐ BÀN"
          value={counts.total}
          unit="Bàn"
          subtitle="Toàn bộ khu vực"
          active={statusFilter === 'all' && selectedArea === 'all' && !searchQuery}
          onClick={clearAllFilters}
        />

        <KpiCard
          icon={Armchair}
          iconColor="#34d399"
          iconBg="rgba(16, 185, 129, 0.14)"
          borderStrip="#10b981"
          label="BÀN TRỐNG"
          value={counts.empty}
          unit="Bàn"
          subtitle={
            counts.total > 0
              ? `${Math.round((counts.empty / counts.total) * 100)}% công suất còn`
              : 'Sẵn sàng đón khách'
          }
          active={statusFilter === 'empty'}
          onClick={() => setStatusFilter(statusFilter === 'empty' ? 'all' : 'empty')}
        />

        <KpiCard
          icon={Users}
          iconColor="#f87171"
          iconBg="rgba(239, 68, 68, 0.14)"
          borderStrip="#ef4444"
          label="ĐANG CÓ KHÁCH"
          value={counts.occupied}
          unit="Bàn"
          subtitle={
            counts.total > 0
              ? `Chiếm ${Math.round((counts.occupied / counts.total) * 100)}% tổng số`
              : 'Đang phục vụ'
          }
          active={statusFilter === 'occupied'}
          onClick={() => setStatusFilter(statusFilter === 'occupied' ? 'all' : 'occupied')}
        />

        <KpiCard
          icon={Calendar}
          iconColor="#fbbf24"
          iconBg="rgba(245, 158, 11, 0.14)"
          borderStrip="#f59e0b"
          label="KHÁCH ĐẶT TRƯỚC"
          value={counts.reserved}
          unit="Bàn"
          subtitle={nearestRes ? `Giờ hẹn gần: ${nearestRes}` : 'Chưa có lịch mới'}
          active={statusFilter === 'reserved'}
          onClick={() => setStatusFilter(statusFilter === 'reserved' ? 'all' : 'reserved')}
        />

        <KpiCard
          icon={ShoppingBag}
          iconColor={onlineOrders.length > 0 ? '#fbbf24' : '#38bdf8'}
          iconBg={onlineOrders.length > 0 ? 'rgba(245, 158, 11, 0.16)' : 'rgba(56, 189, 248, 0.12)'}
          borderStrip={onlineOrders.length > 0 ? '#f59e0b' : '#38bdf8'}
          label="ĐƠN ONLINE / MANG VỀ"
          value={onlineOrders.length}
          unit="Đơn"
          subtitle={onlineOrders.length > 0 ? 'Cần xử lý ngay' : 'Đang trực tuyến'}
          active={false}
          onClick={() => {
            if (onlineOrders.length > 0) {
              const el = document.getElementById('online-orders-section');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              else navigate('/orders');
            } else {
              navigate('/orders');
            }
          }}
        />
      </div>

      {/* ========================================================
          C. KHỐI ĐƠN ONLINE & MANG VỀ (CHỈ HIỆN KHI CÓ ĐƠN ĐANG CHỜ)
          ======================================================== */}
      {onlineOrders.length > 0 && (
        <div
          id="online-orders-section"
          className="mockup-panel"
          style={{
            padding: '16px 20px',
            border: '1.5px solid #d97706',
            background: 'linear-gradient(135deg, rgba(42, 22, 11, 0.95), rgba(24, 13, 6, 0.95))',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(217, 119, 6, 0.2)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '14px',
              flexWrap: 'wrap',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ShoppingBag size={20} color="#fbbf24" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fbbf24', fontWeight: 800 }}>
                  ĐƠN ĐẶT ONLINE & MANG VỀ ĐANG CHỜ ({onlineOrders.length} ĐƠN)
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#d4b094' }}>
                  Khách hàng vừa đặt trực tuyến qua website. Tự động đồng bộ sang Barista & Thu ngân.
                </p>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-sm"
              onClick={() => navigate('/orders')}
              style={{
                background: '#d97706',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.78rem',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span>Xem tại List Đơn Hàng</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
              gap: '12px',
            }}
          >
            {onlineOrders.map((o) => {
              const isScheduled = o.status === 'scheduled';
              const isPending = o.status === 'pending' || o.status === 'open';
              return (
                <div
                  key={o.id}
                  style={{
                    background: '#1c1008',
                    border: isScheduled
                      ? '1px solid #a855f7'
                      : isPending
                      ? '1px solid #f59e0b'
                      : '1px solid #38bdf8',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.92rem', ...NL }}>
                        #{o.code || o.invoice_no}
                      </span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '10px',
                          background: isScheduled
                            ? 'rgba(168, 85, 247, 0.2)'
                            : isPending
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(56, 189, 248, 0.2)',
                          color: isScheduled ? '#c084fc' : isPending ? '#fbbf24' : '#38bdf8',
                          border: isScheduled
                            ? '1px solid #a855f7'
                            : isPending
                            ? '1px solid #f59e0b'
                            : '1px solid #38bdf8',
                          ...NL,
                        }}
                      >
                        {isScheduled
                          ? `Hẹn: ${o.pickup_time ? String(o.pickup_time).replace('T', ' ').slice(11, 16) : 'Trước'}`
                          : isPending
                          ? 'Chờ pha chế'
                          : 'Đang pha chế'}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.82rem', color: '#fef3c7', fontWeight: 700, marginBottom: '2px' }}>
                      {o.customer_name || 'Khách đặt online'} {o.customer_phone ? `(${o.customer_phone})` : ''}
                    </div>

                    {isScheduled && o.pickup_time && (
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#e9d5ff',
                          background: 'rgba(168, 85, 247, 0.15)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          margin: '4px 0',
                          border: '1px solid rgba(168, 85, 247, 0.3)',
                          ...NL,
                        }}
                      >
                        Giờ nhận: <strong>{String(o.pickup_time).replace('T', ' ').slice(0, 16)}</strong>
                      </div>
                    )}

                    <div
                      style={{
                        fontSize: '0.78rem',
                        color: '#e5d5c5',
                        margin: '6px 0',
                        lineHeight: 1.35,
                        maxHeight: '44px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {o.items_summary || 'Món đang tải...'}
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        borderTop: '1px solid #382012',
                        paddingTop: '6px',
                        fontSize: '0.82rem',
                      }}
                    >
                      <span style={{ color: '#a88265', fontWeight: 600 }}>Tổng tiền:</span>
                      <span style={{ fontWeight: 900, color: '#fbbf24', fontSize: '0.96rem', ...NL }}>
                        {fmt(o.total)}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    {isScheduled ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleUpdateOnlineStatus(o.id, 'preparing')}
                        title="Khách đến sớm - Bắt đầu pha chế ngay"
                        style={{
                          flex: 1,
                          background: '#7c3aed',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          padding: '6px',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        Pha chế sớm
                      </button>
                    ) : isPending ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleUpdateOnlineStatus(o.id, 'preparing')}
                        style={{
                          flex: 1,
                          background: '#d97706',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          padding: '6px',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        Bắt đầu pha chế
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleUpdateOnlineStatus(o.id, 'done')}
                        style={{
                          flex: 1,
                          background: '#10b981',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          padding: '6px',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                        }}
                      >
                        Pha xong & Trả món
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => navigate('/orders')}
                      style={{
                        borderColor: '#5a341e',
                        color: '#d4b094',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                        padding: '6px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      Chi tiết
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================
          D. THANH BỘ LỌC (KHU VỰC, TRẠNG THÁI & TÌM KIẾM - CHUẨN POS)
          ======================================================== */}
      <div
        className="mockup-panel"
        style={{
          padding: '14px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          borderRadius: '12px',
        }}
      >
        {/* Hàng 1: Chip Khu Vực (chuẩn danh mục POS) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.8rem',
              fontWeight: 800,
              color: '#c4a482',
              letterSpacing: '0.04em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              marginRight: '4px',
            }}
          >
            <MapPin size={14} color="#d97706" />
            KHU VỰC:
          </span>

          <FilterChip
            active={selectedArea === 'all'}
            label="Tất cả"
            count={counts.total}
            onClick={() => setSelectedArea('all')}
          />

          {(data.areas || []).map((a) => {
            const count = (data.tables || []).filter((t) => String(t.area_id) === String(a.id)).length;
            return (
              <FilterChip
                key={a.id}
                active={selectedArea === String(a.id)}
                label={a.name}
                count={count}
                onClick={() => setSelectedArea(String(a.id))}
              />
            );
          })}
        </div>

        {/* Hàng 2: Lọc Trạng Thái + Ô Tìm Bàn */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '10px',
            borderTop: '1px solid rgba(245, 158, 11, 0.1)',
          }}
        >
          {/* Lọc Trạng Thái */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#c4a482', letterSpacing: '0.04em' }}>
              TRẠNG THÁI:
            </span>
            <FilterChip
              active={statusFilter === 'all'}
              label="Tất cả"
              onClick={() => setStatusFilter('all')}
            />
            <FilterChip
              active={statusFilter === 'empty'}
              label="Trống"
              count={counts.empty}
              dotColor="#10b981"
              onClick={() => setStatusFilter(statusFilter === 'empty' ? 'all' : 'empty')}
            />
            <FilterChip
              active={statusFilter === 'occupied'}
              label="Đang phục vụ"
              count={counts.occupied}
              dotColor="#ef4444"
              onClick={() => setStatusFilter(statusFilter === 'occupied' ? 'all' : 'occupied')}
            />
            <FilterChip
              active={statusFilter === 'reserved'}
              label="Đã đặt trước"
              count={counts.reserved}
              dotColor="#f59e0b"
              onClick={() => setStatusFilter(statusFilter === 'reserved' ? 'all' : 'reserved')}
            />
          </div>

          {/* Ô Tìm Bàn (UI thuần, chuẩn POS) */}
          <div style={{ position: 'relative', minWidth: '220px', flex: '0 1 280px' }}>
            <Search
              size={15}
              color="#a88265"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm bàn (VD: 01, Tầng 1, Linh...)"
              className="form-input"
              style={{
                width: '100%',
                paddingLeft: '32px',
                paddingRight: searchQuery ? '30px' : '10px',
                paddingTop: '6px',
                paddingBottom: '6px',
                fontSize: '0.82rem',
                borderRadius: '8px',
                background: 'rgba(20, 10, 5, 0.7)',
                borderColor: 'rgba(245, 158, 11, 0.25)',
                color: '#fef3c7',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#a88265',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ========================================================
          E. LƯỚI BÀN (SKELETON / ERROR / EMPTY / GROUPED / FLAT)
          ======================================================== */}
      {loading && data.tables.length === 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '14px',
          }}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : loadError ? (
        <div
          className="mockup-panel"
          style={{
            padding: '36px',
            textAlign: 'center',
            borderRadius: '12px',
            border: '1.5px solid rgba(239, 68, 68, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <AlertCircle size={40} color="#ef4444" />
          <h3 style={{ margin: 0, color: '#f87171', fontSize: '1.1rem' }}>{loadError}</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={loadTables}
            style={{
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              borderColor: '#d97706',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={14} />
            <span>Thử lại</span>
          </button>
        </div>
      ) : filteredTables.length === 0 ? (
        <div
          className="mockup-panel"
          style={{
            padding: '48px 24px',
            textAlign: 'center',
            borderRadius: '12px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <Coffee size={40} color="#c4a482" />
          <h3 style={{ margin: 0, color: '#fef3c7', fontSize: '1.1rem' }}>
            Không tìm thấy bàn nào phù hợp
          </h3>
          <p style={{ margin: 0, color: '#a88265', fontSize: '0.85rem' }}>
            Vui lòng thử đổi khu vực, bộ lọc trạng thái hoặc từ khóa tìm kiếm.
          </p>
          <button
            type="button"
            className="btn btn-outline"
            onClick={clearAllFilters}
            style={{ marginTop: '8px', borderColor: '#d97706', color: '#fbbf24', fontWeight: 700 }}
          >
            Xóa tất cả bộ lọc
          </button>
        </div>
      ) : groupedByArea ? (
        /* Khi chọn "Tất cả" & không có tìm kiếm: Nhóm bàn theo từng khu vực */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {groupedByArea.map((group) => (
            <AreaGroup
              key={group.name}
              areaName={group.name}
              tables={group.tables}
              onOpenToPos={handleOpenTableToPos}
              onFreeTable={handleFreeTable}
              onCheckIn={handleCheckInReservedTable}
              onCancelReserve={handleCancelReservation}
            />
          ))}
        </div>
      ) : (
        /* Khi đã lọc theo khu vực, trạng thái hoặc tìm kiếm: Lưới phẳng */
        <div
          className="table-card-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '14px',
          }}
        >
          {filteredTables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              onOpenToPos={handleOpenTableToPos}
              onFreeTable={handleFreeTable}
              onCheckIn={handleCheckInReservedTable}
              onCancelReserve={handleCancelReservation}
            />
          ))}
        </div>
      )}

      {/* ========================================================
          F. MODAL: ĐẶT BÀN TRƯỚC
          ======================================================== */}
      {showReserveModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '20px',
          }}
          onClick={() => setShowReserveModal(false)}
        >
          <div
            className="animate-fade-in"
            style={{
              background: '#1c120b',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              border: '2px solid rgba(245, 158, 11, 0.4)',
              boxShadow: '0 25px 50px rgba(0,0,0,0.85)',
              overflow: 'hidden',
              color: '#fdf8f0',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                background: 'linear-gradient(135deg, #2a180e, #1c1008)',
                padding: '16px 20px',
                borderBottom: '1px solid rgba(245, 158, 11, 0.25)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={20} color="#fbbf24" />
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#fef3c7' }}>
                  ĐẶT BÀN TRƯỚC CHO KHÁCH
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowReserveModal(false)}
                style={{ background: 'none', border: 'none', color: '#c4a482', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={handleSaveReservation}
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24', display: 'block', marginBottom: '4px' }}>
                  CHỌN BÀN:
                </label>
                <select
                  className="form-select"
                  value={reserveTableTarget ? reserveTableTarget.id : ''}
                  onChange={(e) => {
                    const t = data.tables.find((tbl) => String(tbl.id) === e.target.value);
                    setReserveTableTarget(t || null);
                  }}
                  style={{ width: '100%', padding: '8px 12px' }}
                  required
                >
                  <option value="">-- Chọn bàn muốn đặt --</option>
                  {(data.tables || []).map((t) => (
                    <option key={t.id} value={t.id} disabled={t.status === 'occupied'}>
                      {t.code} ({t.area_name} - {t.seats} ghế){' '}
                      {t.status === 'occupied'
                        ? ' [Đang có khách]'
                        : t.status === 'reserved'
                        ? ' [Đã có người đặt]'
                        : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                  TÊN KHÁCH HÀNG:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Ví dụ: Anh Hoàng"
                  value={reserveForm.name}
                  onChange={(e) => setReserveForm({ ...reserveForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                  SỐ ĐIỆN THOẠI:
                </label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="0988 123 456"
                  value={reserveForm.phone}
                  onChange={(e) => setReserveForm({ ...reserveForm, phone: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                    GIỜ HẸN ĐẾN:
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="19:30"
                    value={reserveForm.time}
                    onChange={(e) => setReserveForm({ ...reserveForm, time: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                    SỐ LƯỢNG KHÁCH:
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    max="20"
                    value={reserveForm.guests}
                    onChange={(e) => setReserveForm({ ...reserveForm, guests: Number(e.target.value) })}
                    style={{ width: '100%', padding: '8px 12px' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fef3c7', display: 'block', marginBottom: '4px' }}>
                  GHI CHÚ / YÊU CẦU ĐẶC BIỆT:
                </label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Ví dụ: Sinh nhật, cần chuẩn bị hoa, bàn view đẹp..."
                  value={reserveForm.note}
                  onChange={(e) => setReserveForm({ ...reserveForm, note: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ borderColor: '#4a2c18', color: '#d5bba2' }}
                  onClick={() => setShowReserveModal(false)}
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #d97706, #b45309)',
                    borderColor: '#d97706',
                    fontWeight: 800,
                    padding: '8px 20px',
                  }}
                >
                  LƯU ĐẶT BÀN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
