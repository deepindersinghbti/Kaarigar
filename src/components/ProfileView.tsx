import React, { useState } from 'react';
import {
  User,
  Mic,
  Briefcase,
  Calendar,
  MapPin,
  Phone,
  Award,
  ShieldCheck,
  IndianRupee,
  CheckCircle2,
  Heart,
  Edit2,
  Save,
} from 'lucide-react';
import { WorkerProfile, SupportedLanguage } from '../types';
import { TRANSLATIONS } from '../data/translations';

interface ProfileViewProps {
  profile: WorkerProfile;
  currentLanguage: SupportedLanguage;
  onUpdateProfileVoice: () => void;
  onSaveProfile: (profile: WorkerProfile) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  currentLanguage,
  onUpdateProfileVoice,
  onSaveProfile,
}) => {
  const t = TRANSLATIONS[currentLanguage];
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<WorkerProfile>({ ...profile });

  const handleSave = () => {
    onSaveProfile(formData);
    setIsEditing(false);
  };

  return (
    <div id="profile-view-container" className="space-y-6 max-w-2xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-gray-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col sm:flex-row items-center justify-between gap-5 relative overflow-hidden border border-gray-800">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-orange-500 text-white font-black text-2xl flex items-center justify-center shadow-lg shadow-orange-500/20">
            {profile.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-extrabold text-white">
                {profile.name}
              </h2>
              <span className="bg-green-500/20 text-green-400 text-xs font-bold px-2.5 py-0.5 rounded-full border border-green-500/30">
                ✓ Verified
              </span>
            </div>
            <p className="text-orange-400 font-bold text-sm">
              {profile.trade} • {profile.experienceYears} Years Exp
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{profile.location}</p>
          </div>
        </div>

        {/* 🎙️ Voice Update Profile Trigger */}
        <button
          id="profile-voice-update-btn"
          onClick={onUpdateProfileVoice}
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm shadow-lg shadow-orange-500/30 transition-all active:scale-95"
        >
          <Mic className="w-4 h-4" />
          <span>{t.updateProfile} (बोलकर)</span>
        </button>
      </div>

      {/* Main Profile Info Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h3 className="font-extrabold text-gray-900 text-base">
            कारीगर विवरण (Worker Information)
          </h3>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-extrabold text-orange-600 hover:text-orange-700 flex items-center gap-1.5"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>{isEditing ? 'Cancel Edit' : 'Edit Details'}</span>
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Full Name (नाम)
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 shadow-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Trade (काम)
                </label>
                <input
                  type="text"
                  value={formData.trade}
                  onChange={(e) =>
                    setFormData({ ...formData, trade: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 shadow-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Experience (Years)
                </label>
                <input
                  type="number"
                  value={formData.experienceYears}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      experienceYears: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 shadow-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Location (शहर / इलाका)
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 shadow-xs"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-700 block mb-1">
                  Daily Rate (₹/दिन)
                </label>
                <input
                  type="number"
                  value={formData.dailyRate || 1200}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      dailyRate: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full px-4 py-2.5 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 text-gray-900 shadow-xs"
                />
              </div>
            </div>

            <button
              onClick={handleSave}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-full font-extrabold flex items-center justify-center gap-2 shadow-md shadow-orange-200 transition-all active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>Save Profile</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  Trade
                </span>
                <span className="text-gray-900 font-extrabold text-sm">
                  {profile.trade}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  Experience
                </span>
                <span className="text-gray-900 font-extrabold text-sm">
                  {profile.experienceYears} Years
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  Daily Rate
                </span>
                <span className="text-green-600 font-black text-sm">
                  ₹{(profile.dailyRate || 1200).toLocaleString('en-IN')}/day
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  Blood Group
                </span>
                <span className="text-red-600 font-black text-sm">
                  {profile.bloodGroup || 'O+'}
                </span>
              </div>
            </div>

            {/* Skills */}
            <div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                Certified Skills (हुनर)
              </span>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="bg-orange-50 text-orange-900 border border-orange-200 text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            {/* Accreditations */}
            <div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                ट्रेनिंग व सर्टिफिकेट्स (Certificates)
              </span>
              <div className="space-y-2.5">
                {profile.certifications.map((cert, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200/80 p-3.5 rounded-2xl flex items-center gap-3"
                  >
                    <Award className="w-5 h-5 text-orange-600 shrink-0" />
                    <span className="text-xs font-bold text-gray-800">
                      {cert}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
