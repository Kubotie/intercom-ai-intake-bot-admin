export const REQUIRED_SLOTS_BY_CATEGORY = {
  tracking_issue:    ["project_name_or_id", "target_url", "symptom", "occurred_at", "recent_change", "tag_type"],
  report_difference: ["project_name_or_id", "report_name", "date_range", "compare_target", "expected_value", "actual_value"],
  login_account:     ["account_email_or_user", "symptom", "occurred_screen", "error_message"],
  billing_contract:  ["contract_target", "inquiry_topic", "target_period", "account_email_or_user", "cancellation_reason"],
  bug_report:        ["project_name_or_id", "symptom", "occurred_at", "reproduction_steps", "experience_name"],
  usage_guidance:    ["target_feature", "user_goal", "feature_category"],
  experience_issue:  ["experience_name", "symptom", "device_type", "occurred_at", "project_name_or_id", "target_url"]
};

// slot の必須/任意区分 (required = true のもののみ LLM が積極的に収集)
export const REQUIRED_SLOT_NAMES_BY_CATEGORY = {
  tracking_issue:    ["project_name_or_id", "target_url", "symptom", "occurred_at", "recent_change"],
  report_difference: ["project_name_or_id", "report_name", "date_range", "compare_target", "expected_value", "actual_value"],
  login_account:     ["account_email_or_user", "symptom", "occurred_screen", "error_message"],
  billing_contract:  ["contract_target", "inquiry_topic", "target_period"],
  bug_report:        ["project_name_or_id", "symptom", "occurred_at", "reproduction_steps"],
  usage_guidance:    ["target_feature", "user_goal"],
  experience_issue:  ["experience_name", "symptom"]
};

// 聴取優先順位 (先頭ほど優先して聞く)
export const SLOT_PRIORITY_BY_CATEGORY = {
  tracking_issue:    ["symptom", "project_name_or_id", "occurred_at", "target_url", "recent_change", "tag_type"],
  report_difference: ["report_name", "compare_target", "date_range", "expected_value", "actual_value", "project_name_or_id"],
  login_account:     ["account_email_or_user", "symptom", "occurred_screen", "error_message"],
  // billing_contract は inquiry_topic の内容によって優先順位が変わる (handoff-guard.js 参照)
  billing_contract:  ["inquiry_topic", "contract_target", "account_email_or_user", "target_period", "cancellation_reason"],
  bug_report:        ["symptom", "reproduction_steps", "occurred_at", "project_name_or_id", "experience_name"],
  // usage_guidance: 機能名と目的の両方が必要。feature_category は LLM が自動推定
  usage_guidance:    ["target_feature", "user_goal", "feature_category"],
  experience_issue:  ["experience_name", "symptom", "device_type", "occurred_at", "project_name_or_id", "target_url"]
};

export const CATEGORY_LIST = Object.keys(REQUIRED_SLOTS_BY_CATEGORY);

// handoff に進める最小条件
// required: すべて揃っていること
// any_of:   各配列のうち少なくとも1つが揃っていること
//
// billing_contract は解約・返金時に追加条件あり → isReadyForHandoff() 内で処理
export const HANDOFF_MIN_CONDITION_BY_CATEGORY = {
  tracking_issue: {
    required: ["symptom"],
    any_of: [["occurred_at", "target_url"]]
  },
  report_difference: {
    required: ["report_name"],
    any_of: [["compare_target", "date_range"]]
  },
  login_account: {
    required: ["account_email_or_user", "symptom"],
    any_of: []
  },
  // 通常の請求/プラン確認: contract_target または inquiry_topic どちらか
  // 解約/返金時: account_email_or_user + inquiry_topic の両方必須 (handoff-guard.js で判定)
  billing_contract: {
    required: [],
    any_of: [["contract_target", "inquiry_topic"]]
  },
  bug_report: {
    required: ["symptom"],
    any_of: [["reproduction_steps", "occurred_at"]]
  },
  // 両方必須 (実履歴分析で片方だと担当者への情報が不十分と判明)
  usage_guidance: {
    required: ["target_feature", "user_goal"],
    any_of: []
  },
  // 体験名があれば担当者が管理画面で直接確認できる
  experience_issue: {
    required: ["experience_name"],
    any_of: [["symptom", "device_type"]]
  }
};

// 解約/返金とみなすキーワード (billing_contract の conditional required 判定に使用)
export const CANCELLATION_KEYWORDS = ["解約", "返金", "違約", "退会", "キャンセル"];
