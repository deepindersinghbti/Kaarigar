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
import { getScreenCopy, localizeDisplayValue, localizeWorkerName } from '../data/uiCopy';

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
  const copy = getScreenCopy(currentLanguage).profile;
  const displayName = localizeWorkerName(profile.name, currentLanguage);
  const identityLabel = profile.verifiedStatus === 'verified'
    ? copy.identityVerified
    : profile.verifiedStatus === 'pending'
      ? copy.verificationPending
      : copy.profileNotVerified;
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
                {displayName}
              </h2>
              <span className="bg-gray-700/70 text-gray-200 text-xs font-bold px-2.5 py-0.5 rounded-full border border-gray-600">
                {identityLabel}
              </span>
            </div>
            <p className="text-orange-400 font-bold text-sm">
              {localizeDisplayValue(profile.trade, currentLanguage)} • {copy.yearsExperience(profile.experienceYears)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">{localizeDisplayValue(profile.location, currentLanguage)}</p>
          </div>
        </div>

        {/* 🎙️ Voice Update Profile Trigger */}
        <button
          id="profile-voice-update-btn"
          onClick={onUpdateProfileVoice}
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold text-sm shadow-lg shadow-orange-500/30 transition-all active:scale-95"
        >
          <Mic className="w-4 h-4" />
          <span>{copy.updateVoice}</span>
        </button>
      </div>

      {/* Main Profile Info Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-gray-200 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h3 className="font-extrabold text-gray-900 text-base">
            {copy.workerInformation}
          </h3>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs font-extrabold text-orange-600 hover:text-orange-700 flex items-center gap-1.5"
          >
            <Edit2 className="w-3.5 h-3.5" />
            <span>{isEditing ? copy.cancelEdit : copy.editDetails}</span>
          </button>
        </div>

        {isEditing ? (
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                {copy.fullName}
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
                  {copy.trade}
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
                  {copy.experience}
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
                  {copy.location}
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
                  {copy.dailyRate}
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
              <span>{copy.saveProfile}</span>
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  {copy.trade}
                </span>
                <span className="text-gray-900 font-extrabold text-sm">
                  {localizeDisplayValue(profile.trade, currentLanguage)}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  {copy.experience}
                </span>
                <span className="text-gray-900 font-extrabold text-sm">
                  {profile.experienceYears} {copy.years}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  {copy.dailyRate}
                </span>
                <span className="text-green-600 font-black text-sm">
                  ₹{(profile.dailyRate || 1200).toLocaleString('en-IN')}{copy.perDay}
                </span>
              </div>
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                <span className="text-gray-400 text-[10px] uppercase font-bold block">
                  {copy.bloodGroup}
                </span>
                <span className="text-red-600 font-black text-sm">
                  {profile.bloodGroup || 'O+'}
                </span>
              </div>
            </div>

            {/* Skills */}
            <div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                {copy.skillsListed}
              </span>
              <div className="flex flex-wrap gap-2">
                {profile.skills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="bg-orange-50 text-orange-900 border border-orange-200 text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                    {localizeDisplayValue(skill, currentLanguage)}
                  </span>
                ))}
              </div>
            </div>

            {/* Accreditations */}
            <div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
                {copy.trainingCertificates}
              </span>
              <p className="text-[11px] text-gray-500 mb-2">
                {copy.credentialNotice}
              </p>
              <div className="space-y-2.5">
                {profile.certifications.map((cert, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-50 border border-gray-200/80 p-3.5 rounded-2xl flex items-center gap-3"
                  >
                    <Award className="w-5 h-5 text-orange-600 shrink-0" />
                    <span className="text-xs font-bold text-gray-800">
                      {localizeDisplayValue(cert, currentLanguage)}
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
