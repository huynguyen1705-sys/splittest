export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      aggregates_minute: {
        Row: {
          assigns: number | null
          avg_ttr_ms: number | null
          browser: string | null
          campaign_id: string
          city: string | null
          country: string | null
          device: string | null
          id: string
          lang: string | null
          minute_ts: string
          os: string | null
          project_id: string
          redirects_fail: number | null
          redirects_ok: number | null
          region: string | null
          unique_sessions: number | null
          unique_visitors: number | null
          variant_id: string | null
        }
        Insert: {
          assigns?: number | null
          avg_ttr_ms?: number | null
          browser?: string | null
          campaign_id: string
          city?: string | null
          country?: string | null
          device?: string | null
          id?: string
          lang?: string | null
          minute_ts: string
          os?: string | null
          project_id: string
          redirects_fail?: number | null
          redirects_ok?: number | null
          region?: string | null
          unique_sessions?: number | null
          unique_visitors?: number | null
          variant_id?: string | null
        }
        Update: {
          assigns?: number | null
          avg_ttr_ms?: number | null
          browser?: string | null
          campaign_id?: string
          city?: string | null
          country?: string | null
          device?: string | null
          id?: string
          lang?: string | null
          minute_ts?: string
          os?: string | null
          project_id?: string
          redirects_fail?: number | null
          redirects_ok?: number | null
          region?: string | null
          unique_sessions?: number | null
          unique_visitors?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aggregates_minute_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aggregates_minute_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aggregates_minute_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assigned_at: string
          campaign_id: string
          id: string
          variant_id: string
          visitor_id: string
        }
        Insert: {
          assigned_at?: string
          campaign_id: string
          id?: string
          variant_id: string
          visitor_id: string
        }
        Update: {
          assigned_at?: string
          campaign_id?: string
          id?: string
          variant_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          project_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          project_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_review_queue: {
        Row: {
          bot_score: number | null
          bot_signals: Json | null
          campaign_id: string | null
          created_at: string | null
          id: string
          ip_hash: string | null
          notes: string | null
          project_id: string
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          session_id: string | null
          user_agent: string | null
          visitor_key_hash: string | null
        }
        Insert: {
          bot_score?: number | null
          bot_signals?: Json | null
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          notes?: string | null
          project_id: string
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          user_agent?: string | null
          visitor_key_hash?: string | null
        }
        Update: {
          bot_score?: number | null
          bot_signals?: Json | null
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          ip_hash?: string | null
          notes?: string | null
          project_id?: string
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          session_id?: string | null
          user_agent?: string | null
          visitor_key_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bot_review_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_review_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bot_review_queue_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_rules: {
        Row: {
          browser_in: string[] | null
          campaign_id: string
          country_in: string[] | null
          created_at: string
          device_in: string[] | null
          id: string
          include_paths: string[] | null
          lang_in: string[] | null
          os_in: string[] | null
          url_match_mode: string | null
        }
        Insert: {
          browser_in?: string[] | null
          campaign_id: string
          country_in?: string[] | null
          created_at?: string
          device_in?: string[] | null
          id?: string
          include_paths?: string[] | null
          lang_in?: string[] | null
          os_in?: string[] | null
          url_match_mode?: string | null
        }
        Update: {
          browser_in?: string[] | null
          campaign_id?: string
          country_in?: string[] | null
          created_at?: string
          device_in?: string[] | null
          id?: string
          include_paths?: string[] | null
          lang_in?: string[] | null
          os_in?: string[] | null
          url_match_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_rules_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          bot_action: string | null
          bot_challenge_enabled: boolean | null
          bot_soft_block_delay_ms: number | null
          bot_threshold: number | null
          bot_whitelist_ips: string[] | null
          bot_whitelist_uas: string[] | null
          created_at: string
          end_at: string | null
          honeypot_url: string | null
          id: string
          name: string
          priority: number | null
          project_id: string
          respect_dnt: boolean | null
          start_at: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          sticky_enabled: boolean | null
          updated_at: string
        }
        Insert: {
          bot_action?: string | null
          bot_challenge_enabled?: boolean | null
          bot_soft_block_delay_ms?: number | null
          bot_threshold?: number | null
          bot_whitelist_ips?: string[] | null
          bot_whitelist_uas?: string[] | null
          created_at?: string
          end_at?: string | null
          honeypot_url?: string | null
          id?: string
          name: string
          priority?: number | null
          project_id: string
          respect_dnt?: boolean | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          sticky_enabled?: boolean | null
          updated_at?: string
        }
        Update: {
          bot_action?: string | null
          bot_challenge_enabled?: boolean | null
          bot_soft_block_delay_ms?: number | null
          bot_threshold?: number | null
          bot_whitelist_ips?: string[] | null
          bot_whitelist_uas?: string[] | null
          created_at?: string
          end_at?: string | null
          honeypot_url?: string | null
          id?: string
          name?: string
          priority?: number | null
          project_id?: string
          respect_dnt?: boolean | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          sticky_enabled?: boolean | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      events_raw: {
        Row: {
          browser: string | null
          campaign_id: string | null
          city: string | null
          country: string | null
          device: string | null
          district: string | null
          error_message: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          ip_hash: string | null
          is_mobile: boolean | null
          is_proxy: boolean | null
          isp: string | null
          lang: string | null
          lat: number | null
          lon: number | null
          meta_json: Json | null
          os: string | null
          path: string | null
          project_id: string
          referrer: string | null
          region: string | null
          session_id: string | null
          time_to_redirect_ms: number | null
          ts: string
          user_agent: string | null
          variant_id: string | null
          visitor_key_hash: string | null
          zip: string | null
        }
        Insert: {
          browser?: string | null
          campaign_id?: string | null
          city?: string | null
          country?: string | null
          device?: string | null
          district?: string | null
          error_message?: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          ip_hash?: string | null
          is_mobile?: boolean | null
          is_proxy?: boolean | null
          isp?: string | null
          lang?: string | null
          lat?: number | null
          lon?: number | null
          meta_json?: Json | null
          os?: string | null
          path?: string | null
          project_id: string
          referrer?: string | null
          region?: string | null
          session_id?: string | null
          time_to_redirect_ms?: number | null
          ts?: string
          user_agent?: string | null
          variant_id?: string | null
          visitor_key_hash?: string | null
          zip?: string | null
        }
        Update: {
          browser?: string | null
          campaign_id?: string | null
          city?: string | null
          country?: string | null
          device?: string | null
          district?: string | null
          error_message?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          ip_hash?: string | null
          is_mobile?: boolean | null
          is_proxy?: boolean | null
          isp?: string | null
          lang?: string | null
          lat?: number | null
          lon?: number | null
          meta_json?: Json | null
          os?: string | null
          path?: string | null
          project_id?: string
          referrer?: string | null
          region?: string | null
          session_id?: string | null
          time_to_redirect_ms?: number | null
          ts?: string
          user_agent?: string | null
          variant_id?: string | null
          visitor_key_hash?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_raw_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_raw_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_raw_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "variants"
            referencedColumns: ["id"]
          },
        ]
      }
      geo_cache: {
        Row: {
          cached_at: string | null
          city: string | null
          country: string | null
          district: string | null
          expires_at: string | null
          ip_hash: string
          is_mobile: boolean | null
          is_proxy: boolean | null
          isp: string | null
          lat: number | null
          lon: number | null
          region: string | null
          zip: string | null
        }
        Insert: {
          cached_at?: string | null
          city?: string | null
          country?: string | null
          district?: string | null
          expires_at?: string | null
          ip_hash: string
          is_mobile?: boolean | null
          is_proxy?: boolean | null
          isp?: string | null
          lat?: number | null
          lon?: number | null
          region?: string | null
          zip?: string | null
        }
        Update: {
          cached_at?: string | null
          city?: string | null
          country?: string | null
          district?: string | null
          expires_at?: string | null
          ip_hash?: string
          is_mobile?: boolean | null
          is_proxy?: boolean | null
          isp?: string | null
          lat?: number | null
          lon?: number | null
          region?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          data_retention_days: number | null
          id: string
          name: string
          primary_domain: string
          publishable_token: string
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_retention_days?: number | null
          id?: string
          name: string
          primary_domain: string
          publishable_token?: string
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_retention_days?: number | null
          id?: string
          name?: string
          primary_domain?: string
          publishable_token?: string
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          bot_score: number | null
          bot_signals: Json | null
          browser: string | null
          campaign_id: string | null
          city: string | null
          country: string | null
          device: string | null
          entry_page: string | null
          exit_page: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          is_bot_suspected: boolean | null
          is_bounced: boolean | null
          is_mobile: boolean | null
          is_proxy: boolean | null
          isp: string | null
          last_activity_at: string | null
          os: string | null
          page_views: number | null
          project_id: string
          referrer: string | null
          region: string | null
          session_key: string
          started_at: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          visitor_key_hash: string
        }
        Insert: {
          bot_score?: number | null
          bot_signals?: Json | null
          browser?: string | null
          campaign_id?: string | null
          city?: string | null
          country?: string | null
          device?: string | null
          entry_page?: string | null
          exit_page?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_bot_suspected?: boolean | null
          is_bounced?: boolean | null
          is_mobile?: boolean | null
          is_proxy?: boolean | null
          isp?: string | null
          last_activity_at?: string | null
          os?: string | null
          page_views?: number | null
          project_id: string
          referrer?: string | null
          region?: string | null
          session_key: string
          started_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_key_hash: string
        }
        Update: {
          bot_score?: number | null
          bot_signals?: Json | null
          browser?: string | null
          campaign_id?: string | null
          city?: string | null
          country?: string | null
          device?: string | null
          entry_page?: string | null
          exit_page?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          is_bot_suspected?: boolean | null
          is_bounced?: boolean | null
          is_mobile?: boolean | null
          is_proxy?: boolean | null
          isp?: string | null
          last_activity_at?: string | null
          os?: string | null
          page_views?: number | null
          project_id?: string
          referrer?: string | null
          region?: string | null
          session_key?: string
          started_at?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          visitor_key_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      variants: {
        Row: {
          campaign_id: string
          created_at: string
          destination_url: string
          id: string
          is_control: boolean | null
          name: string
          weight: number | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          destination_url: string
          id?: string
          is_control?: boolean | null
          name: string
          weight?: number | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          destination_url?: string
          id?: string
          is_control?: boolean | null
          name?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "variants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      visitors: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          project_id: string
          visitor_key_hash: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          project_id: string
          visitor_key_hash: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          project_id?: string
          visitor_key_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_status: "draft" | "active" | "paused" | "completed"
      device_type: "mobile" | "tablet" | "desktop"
      event_type: "assign" | "redirect_ok" | "redirect_fail" | "goal"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      campaign_status: ["draft", "active", "paused", "completed"],
      device_type: ["mobile", "tablet", "desktop"],
      event_type: ["assign", "redirect_ok", "redirect_fail", "goal"],
    },
  },
} as const
