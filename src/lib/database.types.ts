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
        Row: { branch_id: string; branch_name: string };
        Insert: { branch_id: string; branch_name: string };
        Update: { branch_id?: string; branch_name?: string };
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
          branch_id: string;
          id: string;
          name: string;
          name_zh: string | null;
          sort_order: number;
        };
        Insert: {
          branch_id: string;
          id?: string;
          name: string;
          name_zh?: string | null;
          sort_order?: number;
        };
        Update: {
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
          track_mfg_date: boolean;
          unit: string;
          unit_zh: string | null;
          updated_at: string;
        };
        Insert: {
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
          track_mfg_date?: boolean;
          unit: string;
          unit_zh?: string | null;
          updated_at?: string;
        };
        Update: {
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
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database["public"]["Tables"];
export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> =
  PublicTables[T]["Insert"];
export type ShelfLifeUnit = "day" | "month";
export type TablesUpdate<T extends keyof PublicTables> =
  PublicTables[T]["Update"];
