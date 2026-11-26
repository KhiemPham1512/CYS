// Sinh từ Supabase (generate_typescript_types), rút gọn phần helper. Đổi schema → sinh lại.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      branch_settings: {
        Row: { branch_id: string; branch_name: string; sheet: Json };
        Insert: { branch_id: string; branch_name: string; sheet?: Json };
        Update: { branch_id?: string; branch_name?: string; sheet?: Json };
        Relationships: [
          {
            foreignKeyName: "branch_settings_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: true;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      branches: {
        Row: { created_at: string; id: string };
        Insert: { created_at?: string; id?: string };
        Update: { created_at?: string; id?: string };
        Relationships: [];
      };
      item_groups: {
        Row: {
          sheet: Json;
          branch_id: string;
          id: string;
          name: string;
          name_zh: string | null;
          sort_order: number;
        };
        Insert: {
          sheet?: Json;
          branch_id: string;
          id?: string;
          name: string;
          name_zh?: string | null;
          sort_order?: number;
        };
        Update: {
          sheet?: Json;
          branch_id?: string;
          id?: string;
          name?: string;
          name_zh?: string | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "item_groups_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      items: {
        Row: {
          sheet: Json;
          branch_id: string;
          case_size: number | null;
          created_at: string;
          group_id: string;
          id: string;
          is_hidden: boolean;
          name: string;
          name_zh: string | null;
          record_by_percent: boolean;
          shelf_life_after_open: number | null;
          shelf_life_after_open_unit: "day" | "month";
          shelf_life: number | null;
          shelf_life_unit: "day" | "month";
          shelf_life_from_receipt_days: number | null;
          skip_count: boolean;
          sort_order: number;
          track_mfg_date: boolean;
          unit: string;
          unit_zh: string | null;
          updated_at: string;
        };
        Insert: {
          sheet?: Json;
          branch_id: string;
          case_size?: number | null;
          created_at?: string;
          group_id: string;
          id?: string;
          is_hidden?: boolean;
          name: string;
          name_zh?: string | null;
          record_by_percent?: boolean;
          shelf_life_after_open?: number | null;
          shelf_life_after_open_unit?: "day" | "month";
          shelf_life?: number | null;
          shelf_life_unit?: "day" | "month";
          shelf_life_from_receipt_days?: number | null;
          skip_count?: boolean;
          sort_order?: number;
          track_mfg_date?: boolean;
          unit: string;
          unit_zh?: string | null;
          updated_at?: string;
        };
        Update: {
          sheet?: Json;
          branch_id?: string;
          case_size?: number | null;
          created_at?: string;
          group_id?: string;
          id?: string;
          is_hidden?: boolean;
          name?: string;
          name_zh?: string | null;
          record_by_percent?: boolean;
          shelf_life_after_open?: number | null;
          shelf_life_after_open_unit?: "day" | "month";
          shelf_life?: number | null;
          shelf_life_unit?: "day" | "month";
          shelf_life_from_receipt_days?: number | null;
          skip_count?: boolean;
          sort_order?: number;
          track_mfg_date?: boolean;
          unit?: string;
          unit_zh?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "items_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "items_branch_id_group_id_fkey";
            columns: ["branch_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "item_groups";
            referencedColumns: ["branch_id", "id"];
          },
        ];
      };
      purchase_orders: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string;
          group_id: string;
          id: string;
          placed_at: string | null;
        };
        Insert: { branch_id: string; group_id: string };
        Update: { placed_at?: string };
        Relationships: [];
      };
      purchase_order_lines: {
        Row: {
          branch_id: string;
          id: string;
          item_id: string;
          order_id: string;
          qty: number;
        };
        Insert: {
          branch_id: string;
          item_id: string;
          order_id: string;
          qty: number;
        };
        Update: { qty?: number };
        Relationships: [];
      };
      purchase_receipts: {
        Row: {
          id: string;
          branch_id: string;
          order_line_id: string;
          good_qty: number;
          short_qty: number;
          damaged_qty: number;
          created_by: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      in_use: {
        Row: {
          id: string;
          branch_id: string;
          item_id: string;
          opened_on: string;
          ended_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: { branch_id: string; item_id: string };
        Update: { ended_at?: string | null };
        Relationships: [];
      };
      supplier_owed: {
        Row: {
          id: string;
          branch_id: string;
          item_id: string;
          kind: "short" | "damaged" | "settled";
          qty: number;
          receipt_id: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      supplier_aliases: {
        Row: {
          alias_key: string;
          branch_id: string;
          created_at: string;
          created_by: string;
          item_id: string;
        };
        Insert: { alias_key: string; branch_id: string; item_id: string };
        Update: { item_id?: string };
        Relationships: [];
      };
      stock_movements: {
        Row: {
          batch_id: string | null;
          branch_id: string;
          created_at: string;
          created_by: string;
          entered_on: string | null;
          expected_qty: number | null;
          id: string;
          item_id: string;
          kind: MovementKind;
          mfg_date: string | null;
          note: string | null;
          order_line_id: string | null;
          qty: number;
          qty_text: string | null;
          seq: number;
          voids_id: string | null;
        };
        Insert: {
          batch_id?: string | null;
          voids_id?: string | null;
          branch_id: string;
          entered_on?: string | null;
          expected_qty?: number | null;
          item_id: string;
          kind: MovementKind;
          mfg_date?: string | null;
          note?: string | null;
          qty: number;
          qty_text?: string | null;
        };
        Update: never;
        Relationships: [];
      };
      members: {
        Row: {
          branch_id: string;
          created_at: string;
          is_admin: boolean;
          is_locked: boolean;
          user_id: string;
        };
        Insert: {
          branch_id: string;
          created_at?: string;
          is_admin?: boolean;
          is_locked?: boolean;
          user_id: string;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          is_admin?: boolean;
          is_locked?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "members_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar: string | null;
          display_name: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar?: string | null;
          display_name?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar?: string | null;
          display_name?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      undo_receipts: {
        Args: { p_receipts: string[] };
        Returns: undefined;
      };
      delete_order_line: {
        Args: { p_line: string };
        Returns: undefined;
      };
      delete_placed_order: {
        Args: { p_order: string };
        Returns: undefined;
      };
      audit_feed: {
        Args: {
          p_branch: string;
          p_actor?: string | null;
          p_from?: string | null;
          p_to?: string | null;
          p_item?: string | null;
          p_limit?: number;
        };
        Returns: {
          logged_at: string;
          actor: string | null;
          actor_email: string | null;
          table_name: string;
          action: string;
          item_id: string | null;
          item_name: string | null;
          old_data: Json | null;
          new_data: Json | null;
        }[];
      };
      branch_member_emails: {
        Args: { p_branch_id: string };
        Returns: { user_id: string; email: string }[];
      };
      receive_order_line: {
        Args: {
          p_line_id: string;
          p_received: number;
          p_damaged: number;
          p_mfg: string | null;
        };
        Returns: void;
      };
      return_damaged: {
        Args: {
          p_item_id: string;
          p_qty: number;
          p_mfg: string | null;
          p_entered_on: string | null;
        };
        Returns: void;
      };
      reset_branch_activity: {
        Args: {
          p_branch: string;
          p_confirm: string;
        };
        Returns: undefined;
      };
      restore_rollback: {
        Args: {
          p_branch: string;
          p_batch: string;
        };
        Returns: number;
      };
      rollback_stock: {
        Args: {
          p_branch: string;
          p_since: string;
          p_actor?: string | null;
        };
        Returns: number;
      };
      settle_owed: {
        Args: {
          p_item_id: string;
          p_qty: number;
          p_mfg: string | null;
        };
        Returns: void;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database["public"]["Tables"];
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> =
  PublicTables[T]["Insert"];
export type ShelfLifeUnit = "day" | "month";
export type MovementKind =
  | "count"
  | "adjust"
  | "assign_mfg"
  | "use"
  | "void"
  | "receive"
  | "return_damaged";
export type TablesUpdate<T extends keyof PublicTables> =
  PublicTables[T]["Update"];
